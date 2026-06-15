#!/usr/bin/env python3
"""Generate fake planetary live-stat CSV data from an MP4."""

from fake_stats_common import run


def main() -> None:
    """Run the planetary fake CSV generator."""
    run("planetary")


if __name__ == "__main__":
    main()
