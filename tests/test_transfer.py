from pathlib import Path

import pytest

from terrashift import transfer


class Reply:
    def __init__(self, status, content_range, blocks):
        self.status_code = status
        self.headers = {"Content-Range": content_range}
        self.blocks = blocks

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def iter_content(self, size):
        yield from self.blocks


class Session:
    def __init__(self, replies):
        self.replies = iter(replies)

    def get(self, *args, **kwargs):
        assert kwargs["timeout"] == (15, 45)
        return next(self.replies)


def test_ranges_reject_ignored_range(monkeypatch, tmp_path):
    session = Session([Reply(200, "", [b"bad"]) for _ in range(3)])
    monkeypatch.setattr(transfer.earthaccess, "get_requests_https_session", lambda: session)
    monkeypatch.setattr(transfer.time, "sleep", lambda _: None)
    with pytest.raises(RuntimeError, match="three bounded"):
        transfer.download_ranges(["https://example.test/science.h5"], tmp_path)


def test_truncated_chunk_retry_rolls_back(monkeypatch, tmp_path):
    session = Session(
        [
            Reply(206, "bytes 0-0/5", [b"a"]),
            Reply(206, "bytes 1-4/5", [b"b"]),
            Reply(206, "bytes 1-4/5", [b"bcde"]),
        ]
    )
    monkeypatch.setattr(transfer.earthaccess, "get_requests_https_session", lambda: session)
    monkeypatch.setattr(transfer.time, "sleep", lambda _: None)
    files = transfer.download_ranges(["https://example.test/science.h5"], tmp_path)
    assert Path(files[0]).read_bytes() == b"abcde"
