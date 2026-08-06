#!/bin/sh

set -eu

fail() {
	printf '%s\n' "error: $*" >&2
	exit 1
}

[ "$(id -u)" -eq 0 ] || fail "run prepare-small-vm.sh as root (for example with sudo)"
[ "$(uname -s)" = "Linux" ] || fail "prepare-small-vm.sh supports Linux hosts only"

for command_name in fallocate mkswap swapon sysctl; do
	command -v "$command_name" >/dev/null 2>&1 || fail "$command_name is required"
done

swap_file=/swapfile
swap_size=1G

if [ -e "$swap_file" ] && [ ! -f "$swap_file" ]; then
	fail "$swap_file exists but is not a regular file"
fi

if [ ! -f "$swap_file" ]; then
	fallocate -l "$swap_size" "$swap_file"
	chmod 0600 "$swap_file"
	mkswap "$swap_file" >/dev/null
fi

chmod 0600 "$swap_file"
if ! swapon --show=NAME --noheadings | grep -Fx "$swap_file" >/dev/null 2>&1; then
	swapon "$swap_file"
fi

if ! grep -Eq '^/swapfile[[:space:]]+none[[:space:]]+swap[[:space:]]+sw[[:space:]]+0[[:space:]]+0$' /etc/fstab; then
	printf '%s\n' '/swapfile none swap sw 0 0' >>/etc/fstab
fi

printf '%s\n' 'vm.swappiness=10' >/etc/sysctl.d/99-zoomigo-small-vm.conf
sysctl --system >/dev/null

printf '%s\n' "Prepared a persistent $swap_size swap file for the 512 MiB VM."
free -h
