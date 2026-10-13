# OpenPremiere

Open source video editor that runs entirely in the browser and is built to look and work like Premiere Pro. No install, no upload, your media stays on your device.

Status: phase 1. Dockable panels and workspaces, project panel, source and program monitors, multi track timeline with razor, ripple, slip and rate tools, keyframes with easing, WebGL effects and Lumetri style color, scopes, titles, realtime export.

Run locally:

    pip install -r server/requirements.txt
    cd server && uvicorn server:app --port 8770

MIT licensed.
