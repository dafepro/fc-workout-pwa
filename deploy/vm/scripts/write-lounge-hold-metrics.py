#!/usr/bin/env python3

import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import tempfile
import time


COUNTS = {
    "totalHeld": "total_held",
    "expiredPermits": "expired_permits",
    "awaitingCanvas": "awaiting_canvas",
    "staleCanvasOutcomes": "stale_canvas_outcomes",
    "totalItemMutations": "total_item_mutations",
    "expiredItemPermits": "expired_item_permits",
    "awaitingItemOutcomes": "awaiting_item_outcomes",
    "staleItemOutcomes": "stale_item_outcomes",
}


def gauge(name, help_text, value):
    return f"# HELP {name} {help_text}\n# TYPE {name} gauge\n{name} {value}\n"


def replace_metrics(directory, name, content):
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w", dir=directory, prefix=".holds-", delete=False
        ) as stream:
            temporary = Path(stream.name)
            stream.write(content)
        os.replace(temporary, directory / name)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


def collect(env_file):
    command = [
        "sh",
        "-c",
        'SCRIPT_DIRECTORY=$1; shift; . "$SCRIPT_DIRECTORY/lib.sh"; '
        'compose --profile operations run --rm --no-TTY --no-deps '
        'admin lounge-placement-holds --stale-after 24h',
        "sh",
        str(Path(__file__).resolve().parent),
        env_file,
    ]
    with subprocess.Popen(
        command,
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        start_new_session=True,
    ) as process:
        try:
            output, _ = process.communicate(timeout=30)
        except subprocess.TimeoutExpired:
            os.killpg(process.pid, signal.SIGKILL)
            process.communicate()
            raise ValueError("collection timed out") from None
        if process.returncode != 0 or len(output) > 65536:
            raise ValueError("collection failed")
    report = json.loads(output)
    if not isinstance(report, dict) or any(
        type(report.get(field)) is not int or not 0 <= report[field] <= 9007199254740991
        for field in COUNTS
    ):
        raise ValueError("invalid report")
    return "".join(
        gauge(
            f"zoomigo_lounge_{metric}",
            "Aggregate read-only Lounge hold count.",
            report[field],
        )
        for field, metric in COUNTS.items()
    ) + gauge(
        "zoomigo_lounge_holds_last_success_timestamp_seconds",
        "Unix time of the last successful Lounge hold collection.",
        int(time.time()),
    )


def main():
    if len(sys.argv) != 3:
        print(
            "usage: write-lounge-hold-metrics.py METRICS_DIRECTORY ENV_FILE",
            file=sys.stderr,
        )
        return 1
    directory = Path(sys.argv[1])
    success = 0
    try:
        content = collect(sys.argv[2])
        replace_metrics(directory, "zoomigo_lounge_holds.prom", content)
        success = 1
    except (OSError, ValueError):
        # Keep the previous success timestamp so failed reads never appear healthy.
        print(
            "Lounge hold metrics collection failed; prior counts retained.",
            file=sys.stderr,
        )
    try:
        replace_metrics(
            directory,
            "zoomigo_lounge_holds_collection.prom",
            gauge(
                "zoomigo_lounge_holds_collection_success",
                "Whether the most recent Lounge hold collection succeeded.",
                success,
            ),
        )
    except OSError:
        print("Lounge hold collection status could not be written.", file=sys.stderr)
        return 1
    return 0 if success else 1


if __name__ == "__main__":
    sys.exit(main())
