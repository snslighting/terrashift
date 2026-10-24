import os
from pathlib import Path

import earthaccess

from .config import ROOT, configure


class AuthenticationRequired(RuntimeError):
    pass


def credential_strategy():
    configure()
    if os.getenv("EARTHDATA_TOKEN") or (os.getenv("EARTHDATA_USERNAME") and os.getenv("EARTHDATA_PASSWORD")):
        return "environment"
    candidates = (
        [Path(os.environ["NETRC"])]
        if os.getenv("NETRC")
        else [ROOT / ".netrc", Path.home() / ".netrc", Path.home() / "_netrc"]
    )
    for path in candidates:
        if path.is_file():
            os.environ["NETRC"] = str(path)
            return "netrc"
    return None


def login(interactive=False):
    strategy = "interactive" if interactive else credential_strategy()
    if not strategy:
        raise AuthenticationRequired(
            "Earthdata credentials are missing. Create a free account at "
            "https://urs.earthdata.nasa.gov/users/new, then run 'terrashift login', "
            "set NETRC, or configure EARTHDATA_TOKEN / EARTHDATA_USERNAME and EARTHDATA_PASSWORD "
            "in the ignored project .env. Never send credentials to the frontend or chat."
        )
    if interactive:
        # Persist inside the explicitly selected project, never implicitly in the home directory.
        os.environ["NETRC"] = str(ROOT / ".netrc")
    try:
        # We persist ourselves to prevent library sidecar files outside the project.
        auth = earthaccess.login(strategy=strategy, persist=False)
        if not auth.authenticated:
            raise AuthenticationRequired(
                "Earthdata rejected the login; check local credentials and account status."
            )
        if interactive:
            from tinynetrc import Netrc

            path = ROOT / ".netrc"
            path.touch(mode=0o600, exist_ok=True)
            creds = Netrc(str(path))
            creds["urs.earthdata.nasa.gov"] = {"login": auth.username, "password": auth.password}
            creds.save()
        return auth
    except AuthenticationRequired:
        raise
    except Exception:  # noqa: BLE001 -- redact third-party authentication errors
        # Third-party error bodies may contain sensitive request information.
        raise AuthenticationRequired(
            "Earthdata login failed. Check your local credentials, network, and Earthdata application authorization."
        ) from None
