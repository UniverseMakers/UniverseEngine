#!/usr/bin/env python3
"""Generate fake cosmos live-stat CSV data from an MP4."""

from fake_stats_common import run


def main() -> None:
    """Run the cosmos fake CSV generator."""
    run("cosmos")


if __name__ == "__main__":
    main()
