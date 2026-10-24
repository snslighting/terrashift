"""Bounded HTTP range transfer using earthaccess's authenticated session."""

import re
import time
from pathlib import Path
from urllib.parse import urlparse

import earthaccess


def download_ranges(links, local_path, threads=1):
    """Retry bounded chunks; reject ignored or inconsistent Content-Range replies."""
    if len(links) != 1 or threads != 1:
        raise ValueError("Range transport expects one science asset.")
    url = links[0]
    if urlparse(url).scheme != "https":
        raise ValueError("HTTPS required.")
    session = earthaccess.get_requests_https_session()
    path = Path(local_path) / Path(urlparse(url).path).name
    size = None
    start = 0
    chunk_size = 32 * 1024 * 1024
    with path.open("wb") as out:
        while size is None or start < size:
            end = start if size is None else min(start + chunk_size, size) - 1
            for attempt in range(3):
                try:
                    with session.get(
                        url,
                        headers={"Range": f"bytes={start}-{end}", "Accept-Encoding": "identity"},
                        stream=True,
                        timeout=(15, 45),
                    ) as response:
                        match = re.fullmatch(
                            r"bytes (\d+)-(\d+)/(\d+)", response.headers.get("Content-Range", "")
                        )
                        if response.status_code != 206 or not match:
                            raise ValueError("Server did not return a valid bounded range.")
                        first, last, total = map(int, match.groups())
                        if (
                            first != start
                            or last != end
                            or total <= end
                            or (size is not None and size != total)
                        ):
                            raise ValueError("Inconsistent HTTP range metadata.")
                        size = total
                        written = 0
                        out.seek(start)
                        out.truncate()
                        for block in response.iter_content(1024 * 1024):
                            written += len(block)
                            if written > end - start + 1:
                                raise ValueError("Response exceeds requested range.")
                            out.write(block)
                        if written != end - start + 1:
                            raise ValueError("Truncated HTTP range.")
                    start = end + 1
                    if start > 1:
                        print(f"Downloaded {start / 1e6:.0f}/{size / 1e6:.0f} MB", flush=True)
                    break
                except Exception:  # noqa: BLE001 -- retry transport; never log private URLs/headers
                    if attempt == 2:
                        raise RuntimeError(
                            "NASA range transfer failed after three bounded attempts."
                        ) from None
                    time.sleep(attempt + 1)
    return [path]
