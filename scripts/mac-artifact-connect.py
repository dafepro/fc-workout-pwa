"""Route one CI artifact operation through the Mac's LAN interface."""

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

HOSTS = {
    "registry": {"ghcr.io:443", "pkg-containers.githubusercontent.com:443"},
    "downloads": {
        "registry.opentofu.org:443", "github.com:443", "api.github.com:443",
        "release-assets.githubusercontent.com:443", "objects.githubusercontent.com:443",
    },
    "handoff": {"api.github.com:443", "uploads.github.com:443"},
}
IP_BOUND_IF = 25  # Darwin <netinet/in.h>


def lan_route():
    result = subprocess.check_output(["/sbin/route", "-n", "get", "-inet", "default"], text=True)
    match = re.search(r"^\s*interface:\s*(en[0-9]+)$", result, re.MULTILINE)
    if not match:
        raise RuntimeError("No Ethernet or Wi-Fi default interface for artifact traffic")
    name = match[1]
    dns = subprocess.run(
        ["/usr/sbin/ipconfig", "getoption", name, "domain_name_server"],
        capture_output=True, text=True, timeout=5, check=False,
    )
    return socket.if_nametoindex(name), dns.stdout.split()


def addresses(host, nameservers):
    for server in nameservers:
        try:
            resolver = ipaddress.IPv4Address(server)
            result = subprocess.check_output(
                ["/usr/bin/dig", f"@{resolver}", "+short", "+time=2", "+tries=1", host, "A"],
                text=True, timeout=5, stderr=subprocess.DEVNULL,
            )
        except (OSError, ValueError, subprocess.SubprocessError):
            continue
        entries = re.findall(r"(?m)^([0-9.]+)$", result)
        if entries:
            return entries
    return [entry[4][0] for entry in socket.getaddrinfo(host, 443, socket.AF_INET, socket.SOCK_STREAM)]


def connect(host, interface, nameservers):
    for address in addresses(host, nameservers):
        if not ipaddress.IPv4Address(address).is_global:
            continue
        upstream = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        try:
            upstream.setsockopt(socket.IPPROTO_IP, IP_BOUND_IF, interface)
            upstream.settimeout(20)
            upstream.connect((address, 443))
            upstream.settimeout(90)
            return upstream
        except OSError:
            upstream.close()
    raise OSError("Artifact LAN connection failed")


class Handler(BaseHTTPRequestHandler):
    timeout = 90

    def log_message(self, *_):
        pass

    def do_CONNECT(self):
        if self.path not in self.server.hosts:
            self.send_error(403)
            return
        try:
            upstream = connect(
                self.path.split(":")[0], self.server.interface, self.server.nameservers
            )
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
    if sys.platform != "darwin" or len(sys.argv) < 3 or sys.argv[1] not in HOSTS:
        raise SystemExit("Usage on macOS: mac-artifact-connect.py SCOPE COMMAND [ARG ...]")
    with Proxy(("127.0.0.1", 0), Handler) as server:
        server.hosts = HOSTS[sys.argv[1]]
        server.interface, server.nameservers = lan_route()
        threading.Thread(target=server.serve_forever, daemon=True).start()
        env = dict(os.environ)
        for name in ("HTTPS_PROXY", "https_proxy"):
            env[name] = f"http://127.0.0.1:{server.server_address[1]}"
        env["NO_PROXY"] = env["no_proxy"] = ""
        try:
            return subprocess.call(sys.argv[2:], env=env)
        finally:
            server.shutdown()


if __name__ == "__main__":
    sys.exit(main())
