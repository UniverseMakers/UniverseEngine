#!/usr/bin/env python3
"""Generate fake galaxy live-stat CSV data from an MP4."""

from fake_stats_common import run


def main() -> None:
    """Run the galaxy fake CSV generator."""
    run("galaxy")


if __name__ == "__main__":
    main()
