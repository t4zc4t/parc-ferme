"""Shared bits: the data branch checked out next to the code, copied so tests can write."""
import os
import shutil
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "pipeline"))

SOURCE = Path(os.environ.get("PF_TEST_STORE", HERE.parent / "store"))


def scratch_store():
    """a throwaway copy of the store, pointed at by PF_STORE"""
    if not (SOURCE / "current").exists():
        raise unittest_skip(f"no data branch at {SOURCE}")
    tmp = Path(tempfile.mkdtemp(prefix="pf-store-"))
    shutil.copytree(SOURCE, tmp, dirs_exist_ok=True, ignore=shutil.ignore_patterns(".git"))
    os.environ["PF_STORE"] = str(tmp)
    return tmp


def unittest_skip(reason):
    import unittest
    return unittest.SkipTest(reason)
