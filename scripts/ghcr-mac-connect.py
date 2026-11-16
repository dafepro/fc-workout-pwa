"""Allow a publishing subprocess to reach GHCR over the Mac's LAN interface."""

import ipaddress
import os
import re
import select
import socket
import socketserver
import subprocess
import sys
import threading
from http.server import BaseHTTPRequestHandler

REGISTRY_HOSTS = {"ghcr.io:443", "pkg-containers.githubusercontent.com:443"}
IP_BOUND_IF = 25  # Darwin <netinet/in.h>


def lan_interface():
    result = subprocess.check_output(["route", "-n", "get", "-inet", "default"], text=True)
    match = re.search(r"^\s*interface:\s*(en[0-9]+)$", result, re.MULTILINE)
    if not match:
        raise RuntimeError("No Ethernet or Wi-Fi default interface for GHCR")
    return socket.if_nametoindex(match[1])


def connect(host, interface):
    for _, _, _, _, address in socket.getaddrinfo(host, 443, socket.AF_INET, socket.SOCK_STREAM):
        if not ipaddress.ip_address(address[0]).is_global:
            continue
        upstream = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        try:
            upstream.setsockopt(socket.IPPROTO_IP, IP_BOUND_IF, interface)
            upstream.settimeout(20)
            upstream.connect(address)
            upstream.settimeout(90)
            return upstream
        except OSError:
            upstream.close()
    raise OSError("GHCR LAN connection failed")


class Handler(BaseHTTPRequestHandler):
    timeout = 90

    def log_message(self, *_):
        pass

    def do_CONNECT(self):
        if self.path not in REGISTRY_HOSTS:
            self.send_error(403)
            return
        try:
            upstream = connect(self.path.split(":")[0], self.server.interface)
        except OSError:
            self.send_error(502)
            return
        with upstream:
            self.send_response(200, "Connection established")
            self.end_headers()
            sockets = (self.connection, upstream)
            try:
                while readable := select.select(sockets, [], [], 90)[0]:
                    for reader in readable:
                        chunk = reader.recv(65536)
                        if not chunk:
                            return
                        target = upstream if reader is self.connection else self.connection
                        target.sendall(chunk)
            except OSError:
                pass


class Proxy(socketserver.ThreadingTCPServer):
    daemon_threads = True


def main():
    if sys.platform != "darwin" or len(sys.argv) < 2:
        raise SystemExit("Usage on macOS: ghcr-mac-connect.py COMMAND [ARG ...]")
    with Proxy(("127.0.0.1", 0), Handler) as server:
        server.interface = lan_interface()
        threading.Thread(target=server.serve_forever, daemon=True).start()
        env = dict(os.environ)
        for name in ("HTTPS_PROXY", "https_proxy"):
            env[name] = f"http://127.0.0.1:{server.server_address[1]}"
        env["NO_PROXY"] = env["no_proxy"] = ""
        try:
            return subprocess.call(sys.argv[1:], env=env)
        finally:
            server.shutdown()


if __name__ == "__main__":
    sys.exit(main())
