#!/usr/bin/env python3
"""Weekly scan of r/MarvelStrikeForce for meta discussion, read politely through safereddit.com.

Writes a digest the weekly routine reads to update src/data/communitySignals.ts.

Politeness rules (so safereddit keeps serving us):
- one request at a time, at least DELAY seconds apart, at most MAX_REQUESTS per run
- every page is cached in the shared cache; pages fetched in the last CACHE_DAYS are never re-fetched,
  and thread pages are fetched once, ever
- a 429 or 503 waits once (honouring Retry-After) and then ends the run; any other error ends it too
- only safereddit.com is contacted

Usage: python3 scripts/reddit-scan.py [--cache DIR] [--offline] [--max N]
  --offline  parse only what's already cached (for testing)
"""
import argparse
import datetime as dt
import hashlib
import html
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request

HOST = 'https://safereddit.com'
SUB = '/r/MarvelStrikeForce'
DELAY = 10
MAX_REQUESTS = 25
CACHE_DAYS = 6
UA = 'msf-planner-weekly-meta-scan/1.0 (personal, ~25 requests a week)'

# Listings worth a look each week: newest, top of the week, and meta searches from the past week.
LISTINGS = [
    f'{SUB}/top?t=week',
    f'{SUB}/new',
    f'{SUB}/search?q=meta&restrict_sr=on&sort=top&t=week',
    f'{SUB}/search?q=who+to+build&restrict_sr=on&sort=top&t=week',
    f'{SUB}/search?q=raid+teams&restrict_sr=on&sort=top&t=week',
    f'{SUB}/search?q=best+team&restrict_sr=on&sort=top&t=week',
]
# A post is worth opening when its title talks about where to spend.
TOPIC = re.compile(
    r'\b(meta|build|invest|focus|priorit|tier|worth|best|strongest|team|raid|war|crucible|battleworld|'
    r'dark dimension|\bdd\d*\b|leaderboard|nerf|buff|rework|g2[01]|t4|iso|unlock|skip|farm)\b', re.I)
MIN_SCORE = 15
MAX_THREADS = 12


def key(url):
    return hashlib.sha256(url.encode()).hexdigest()[:16]


class Fetcher:
    def __init__(self, cache, offline, limit):
        self.cache, self.offline, self.limit = cache, offline, limit
        self.index_path = os.path.join(cache, 'index.json')
        self.index = json.load(open(self.index_path)) if os.path.exists(self.index_path) else {}
        self.requests = 0
        self.last = 0.0
        self.stopped = None

    def get(self, path, max_age_days=CACHE_DAYS):
        url = HOST + path
        k = key(url)
        entry = self.index.get(k)
        file = os.path.join(self.cache, f'{k}.html')
        if entry and os.path.exists(file):
            age = dt.datetime.now(dt.timezone.utc) - dt.datetime.fromisoformat(entry['fetched'].replace('Z', '+00:00'))
            if max_age_days is None or age.days < max_age_days or self.offline:
                return open(file, encoding='utf-8').read()
        if self.offline or self.stopped or self.requests >= self.limit:
            return None
        wait = DELAY - (time.time() - self.last)
        if wait > 0:
            time.sleep(wait)
        for attempt in (1, 2):
            self.last = time.time()
            self.requests += 1
            try:
                req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': 'text/html'})
                with urllib.request.urlopen(req, timeout=30) as r:
                    body = r.read().decode('utf-8', 'replace')
                    final = r.geturl()
                break
            except urllib.error.HTTPError as e:
                if e.code in (429, 503) and attempt == 1:
                    pause = min(int(e.headers.get('Retry-After') or 120), 300)
                    print(f'  {e.code} on {path}; waiting {pause}s once', file=sys.stderr)
                    time.sleep(pause)
                    continue
                self.stopped = f'HTTP {e.code} on {path}'
                return None
            except Exception as e:  # network trouble: stop rather than retry in a loop
                self.stopped = f'{type(e).__name__} on {path}'
                return None
        open(file, 'w', encoding='utf-8').write(body)
        self.index[k] = {'url': url, 'final': final, 'fetched': dt.datetime.now(dt.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')}
        json.dump(self.index, open(self.index_path, 'w'), indent=1)
        return body


def text(s):
    return html.unescape(re.sub(r'<[^>]+>', ' ', s)).replace('\xa0', ' ').strip()


def posts(page):
    """Posts on a listing page: id, title, link, date, score, comment count."""
    out = []
    for block in re.split(r'<div class="post" id="', page)[1:]:
        pid = block.split('"', 1)[0]
        link = re.search(r'<a href="(/r/MarvelStrikeForce/comments/[^"]+)">(.*?)</a>\s*</h2>', block, re.S)
        if not link:
            continue
        created = re.search(r'class="created" title="([^"]+)"', block)
        score = re.search(r'class="post_score" title="(\d+)"', block)
        comments = re.search(r'class="post_comments"[^>]*title="(\d+)', block)
        out.append({
            'id': pid, 'title': text(link.group(2)), 'path': link.group(1),
            'created': created.group(1) if created else '', 'score': int(score.group(1)) if score else 0,
            'comments': int(comments.group(1)) if comments else 0,
        })
    return out


def thread(page, top=12):
    """The post's text and its highest-scored comments."""
    body = re.search(r'<div class="post_body">(.*?)</div>\s*</div>', page, re.S) or re.search(r'class="post_body[^"]*">(.*?)</div>', page, re.S)
    comments = []
    for m in re.finditer(r'class="comment_score" title="(-?\d+)".*?class="created" title="([^"]+)".*?<div class="comment_body ?"><div class="md">(.*?)</div></div>', page, re.S):
        comments.append({'score': int(m.group(1)), 'created': m.group(2), 'text': text(m.group(3))[:800]})
    comments.sort(key=lambda c: -c['score'])
    return {'body': text(body.group(1))[:2000] if body else '', 'comments': comments[:top]}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--cache', default='/mnt/project-files/msf-planner/reddit-cache')
    ap.add_argument('--offline', action='store_true')
    ap.add_argument('--max', type=int, default=MAX_REQUESTS)
    args = ap.parse_args()
    os.makedirs(args.cache, exist_ok=True)
    state_path = os.path.join(args.cache, 'scan-state.json')
    state = json.load(open(state_path)) if os.path.exists(state_path) else {'seen': []}
    seen = set(state['seen'])
    f = Fetcher(args.cache, args.offline, args.max)

    found = {}
    for path in LISTINGS:
        page = f.get(path)
        for p in posts(page or ''):
            found.setdefault(p['id'], p)
    fresh = [p for p in found.values() if p['id'] not in seen and p['score'] >= MIN_SCORE and TOPIC.search(p['title'])]
    fresh.sort(key=lambda p: -(p['score'] + 2 * p['comments']))

    digest = []
    for p in fresh[:MAX_THREADS]:
        page = f.get(p['path'], max_age_days=None)  # threads: fetch once, keep forever
        if page is None:
            continue
        digest.append({**p, 'url': 'https://www.reddit.com' + p['path'], **thread(page)})
        seen.add(p['id'])

    today = dt.date.today().isoformat()
    out_dir = os.path.join(args.cache, 'scans')
    os.makedirs(out_dir, exist_ok=True)
    out = os.path.join(out_dir, f'{today}.json')
    json.dump({'date': today, 'requests': f.requests, 'stopped': f.stopped, 'listed': len(found), 'posts': digest}, open(out, 'w'), indent=1)
    if not args.offline:
        state = {'seen': sorted(seen)[-2000:], 'lastScan': today}
        json.dump(state, open(state_path, 'w'), indent=1)
    print(f'{len(digest)} new threads from {len(found)} listed posts, {f.requests} requests'
          + (f'; stopped early: {f.stopped}' if f.stopped else '') + f'\ndigest: {out}')


if __name__ == '__main__':
    main()
