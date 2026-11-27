from __future__ import annotations

import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parent.parent


def load_script(name: str):
    path = REPO_ROOT / "scripts" / f"{name}.py"
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Unable to load {path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


manifest = load_script("generate_run_manifest")
thumbnails = load_script("generate_gallery_thumbnails")
downloader = load_script("download_engine_assets")


class GalleryAssetTests(unittest.TestCase):
    def test_local_manifest_discovers_thumbnail_and_skips_tmp_video(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            run_dir = Path(directory) / "Fb1.00_AGN1.00_G1.00"
            animations = run_dir / "animations"
            animations.mkdir(parents=True)
            (animations / "Gas_Density.mp4").touch()
            (animations / "render.tmp.mp4").touch()
            (run_dir / "gallery-thumbnail.webp").touch()

            entry = manifest.build_manifest_entry(
                "cosmos",
                run_dir,
                lambda path: path.relative_to(run_dir).as_posix(),
            )

            self.assertIsNotNone(entry)
            assert entry is not None
            self.assertEqual(entry["thumbnailPath"], "gallery-thumbnail.webp")
            self.assertEqual(entry["views"], {"gas_density": "animations/Gas_Density.mp4"})

    def test_r2_manifest_discovers_thumbnail(self) -> None:
        run_id = "Fb1.00_AGN1.00_G1.00"
        entry = manifest.build_manifest_entry_from_r2(
            simulation_id="cosmos",
            run_id=run_id,
            object_keys=[
                f"cosmos/{run_id}/animations/Gas_Density.mp4",
                f"cosmos/{run_id}/gallery-thumbnail.webp",
            ],
            object_prefix="engine",
            bucket="bucket",
            s3=object(),
        )

        self.assertIsNotNone(entry)
        assert entry is not None
        self.assertEqual(
            entry["thumbnailPath"],
            f"/engine/cosmos/{run_id}/gallery-thumbnail.webp",
        )

    def test_planetary_jobs_use_imported_png(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            source_root = Path(directory)
            source = source_root / "run-a" / "gallery-thumbnail.png"
            source.parent.mkdir()
            source.touch()
            jobs, missing = thumbnails.build_jobs(
                {
                    "runs": [
                        {
                            "simulationId": "planetary",
                            "runId": "run-a",
                            "views": {"houdini": "unused.mp4"},
                        }
                    ]
                },
                ("planetary",),
                source_root,
            )

            self.assertEqual(missing, [])
            self.assertEqual(len(jobs), 1)
            self.assertEqual(jobs[0].source, source)
            self.assertEqual(jobs[0].destination.name, "gallery-thumbnail.webp")

    def test_missing_local_video_falls_back_to_primary_base(self) -> None:
        jobs, missing = thumbnails.build_jobs(
            {
                "primaryBase": "https://example.org/",
                "runs": [
                    {
                        "simulationId": "cosmos",
                        "runId": "not-on-disk",
                        "views": {"gas_density": "/engine/cosmos/not-on-disk/animations/Gas_Density.mp4"},
                    }
                ],
            },
            ("cosmos",),
            Path("unused"),
        )

        self.assertEqual(missing, [])
        self.assertEqual(
            jobs[0].source,
            "https://example.org/engine/cosmos/not-on-disk/animations/Gas_Density.mp4",
        )

    def test_downloader_fetches_gallery_thumbnail(self) -> None:
        manifest_data = {
            "primaryBase": "https://example.org",
            "runs": [{
                "simulationId": "galaxy",
                "runId": "track0",
                "thumbnailPath": "/engine/galaxy/track0/gallery-thumbnail.webp",
            }],
        }
        tasks = downloader.collect_downloads(manifest_data, None, Path("assets"), None)
        thumbnail = [task for task in tasks if task["asset_kind"] == "thumbnail"]

        self.assertEqual(len(thumbnail), 1)
        self.assertEqual(thumbnail[0]["url"], "https://example.org/engine/galaxy/track0/gallery-thumbnail.webp")
        self.assertEqual(thumbnail[0]["dest"], str(Path("assets/galaxy/track0/gallery-thumbnail.webp")))


if __name__ == "__main__":
    unittest.main()
