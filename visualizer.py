"""Local web interface for the flight simulation: python3 visualizer.py."""
import json
import math
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse
from simulation import simulate

ROOT = Path(__file__).resolve().parent

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        url = urlparse(self.path)
        if url.path in ('/', '/index.html', '/visualizer.js', '/visualizer.css', '/simulation.js', '/simulation-worker.js', '/vendor/three.module.min.js', '/vendor/three.core.min.js'):
            filename = 'index.html' if url.path == '/' else url.path.lstrip('/')
            data = (ROOT / filename).read_bytes()
            self.send_response(200)
            mime = 'text/html' if filename.endswith('.html') else 'text/css' if filename.endswith('.css') else 'text/javascript'
            self.send_header('Content-Type', mime + '; charset=utf-8')
        elif url.path == '/simulate':
            try:
                q = parse_qs(url.query)
                keys = ('mass', 'propellant', 'thrust', 'burn_time', 'drag_coefficient', 'diameter')
                values = [float(q[k][0]) for k in keys]
                if not all(math.isfinite(v) for v in values):
                    raise ValueError('All values must be finite numbers')
                wind = float(q.get('wind', ['0'])[0])
                angle = float(q.get('launch_angle', ['0'])[0])
                options = {k: float(q.get(k, [str(default)])[0]) for k, default in [('length', .7), ('chute_diameter', .65), ('stability', 1.5)]}
                recovery = q.get('recovery', ['1'])[0] == '1'
                data = json.dumps(simulate(*values, include_trajectory=True, wind=wind, launch_angle=angle, recovery=recovery, **options), allow_nan=False).encode()
                self.send_response(200)
            except (ValueError, KeyError, IndexError, RuntimeError, OverflowError) as error:
                data = json.dumps({'error': str(error)}).encode()
                self.send_response(400)
            self.send_header('Content-Type', 'application/json')
        else:
            self.send_error(404)
            return
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

if __name__ == '__main__':
    server = ThreadingHTTPServer(('127.0.0.1', 8000), Handler)
    print('Open http://127.0.0.1:8000 in your browser. Press Ctrl+C to stop.', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
