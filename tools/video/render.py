"""Cut one clip from the source and composite the studio's branding onto it.

   clip json: {id, ranges: [[a, b], ...] (source seconds), hook, lowerName, lowerTitle,
               endLine, endSmall, cues: [{start, end, text}] (clip seconds)}
   Output: <out>/<id>.mp4, 1080x1920 H.264, SDR (the iPhone HDR is tone-mapped).
"""
import json, os, subprocess, sys

SRC = '/home/user/www-video/src/video1.mov'
TOOLS = os.path.dirname(os.path.abspath(__file__))
TITLE_DUR, LOWER_AT, LOWER_DUR, END_DUR, FADE = 3.0, 1.0, 5.0, 3.0, 0.3
TONEMAP = 'zscale=t=linear:npl=203,format=gbrpf32le,zscale=p=bt709,tonemap=tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,format=yuv420p'


def run(cmd):
    subprocess.run(cmd, check=True)


def main(clip_path, out_dir):
    c = json.load(open(clip_path))
    out_dir = os.path.abspath(out_dir)
    work = os.path.join(out_dir, 'work', c['id'])
    os.makedirs(work, exist_ok=True)
    json.dump(c, open(os.path.join(work, 'spec.json'), 'w'))
    run(['node', os.path.join(TOOLS, 'overlays.js'), os.path.join(work, 'spec.json'), work])

    # 1. The footage: each range cut, tone-mapped, and joined (a straight cut between ranges).
    inter = os.path.join(work, 'footage.mkv')
    cmd, fc, n = ['ffmpeg', '-v', 'error', '-y'], '', len(c['ranges'])
    for a, b in c['ranges']:
        cmd += ['-ss', '%.3f' % a, '-t', '%.3f' % (b - a), '-i', SRC]
    for i in range(n):
        fc += '[%d:v]%s,setsar=1,fps=30,setpts=PTS-STARTPTS[v%d];[%d:a:0]aresample=48000,asetpts=PTS-STARTPTS,afade=t=in:d=0.04,areverse,afade=t=in:d=0.08,areverse[a%d];' % (i, TONEMAP, i, i, i)
    fc += ''.join('[v%d][a%d]' % (i, i) for i in range(n)) + 'concat=n=%d:v=1:a=1[v][a]' % n
    run(cmd + ['-filter_complex', fc, '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '14',
               '-pix_fmt', 'yuv420p', '-c:a', 'pcm_s16le', '-max_muxing_queue_size', '99999', inter])
    dur = sum(b - a for a, b in c['ranges'])

    # 2. The caption track: caption PNGs and a transparent blank for the gaps.
    blank = os.path.join(work, 'blank.png')
    run(['ffmpeg', '-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=black@0.0:s=1080x1920,format=rgba', '-frames:v', '1', blank])
    lines, t = [], 0.0
    for i, q in enumerate(c['cues']):
        s, e = max(t, q['start']), min(dur, q['end'])
        if e <= s:
            continue
        if s > t:
            lines += ["file '%s'" % blank, 'duration %.3f' % (s - t)]
        lines += ["file '%s'" % os.path.join(work, 'cap%03d.png' % i), 'duration %.3f' % (e - s)]
        t = e
    if t < dur:
        lines += ["file '%s'" % blank, 'duration %.3f' % (dur - t)]
    lines += ["file '%s'" % blank]
    open(os.path.join(work, 'caps.txt'), 'w').write('\n'.join(lines) + '\n')

    # 3. Branding on top, then the end card.
    out = os.path.join(out_dir, c['id'] + '.mp4')
    fc = (
        '[1:v]format=rgba,fps=30,setpts=PTS-STARTPTS[caps];'
        '[2:v]format=rgba,fade=t=in:st=0:d=0.25:alpha=1,fade=t=out:st=%.2f:d=0.4:alpha=1[title];' % (TITLE_DUR - 0.4) +
        '[3:v]format=rgba,fade=t=in:st=0:d=0.35:alpha=1,fade=t=out:st=%.2f:d=0.35:alpha=1,setpts=PTS+%.2f/TB[lower];' % (LOWER_DUR - 0.35, LOWER_AT) +
        '[5:v]format=rgba[bug];[0:v][bug]overlay=0:0[v0];'
        '[v0][caps]overlay=0:0:shortest=1[v1];'
        '[v1][title]overlay=0:0:eof_action=pass[v2];'
        '[v2][lower]overlay=0:0:eof_action=pass,format=yuv420p,setsar=1[main];'
        '[4:v]format=rgba,fps=30,fade=t=in:st=0:d=%.2f,format=yuv420p,setsar=1[endv];' % FADE +
        '[0:a]afade=t=out:st=%.2f:d=0.25[a0];' % max(0, dur - 0.25) +
        'anullsrc=r=48000:cl=stereo,atrim=0:%.2f[a1];' % END_DUR +
        '[main][a0][endv][a1]concat=n=2:v=1:a=1[v][a]'
    )
    run(['ffmpeg', '-v', 'error', '-y', '-i', inter,
         '-f', 'concat', '-safe', '0', '-i', os.path.join(work, 'caps.txt'),
         '-loop', '1', '-t', '%.2f' % TITLE_DUR, '-i', os.path.join(work, 'title.png'),
         '-loop', '1', '-t', '%.2f' % LOWER_DUR, '-i', os.path.join(work, 'lower.png'),
         '-loop', '1', '-t', '%.2f' % END_DUR, '-i', os.path.join(work, 'end.png'),
         '-i', os.path.join(work, 'bug.png'),
         '-filter_complex', fc, '-map', '[v]', '-map', '[a]',
         '-c:v', 'libx264', '-preset', 'faster', '-crf', '20', '-pix_fmt', 'yuv420p',
         '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709',
         '-c:a', 'aac', '-b:a', '160k', '-max_muxing_queue_size', '99999', '-movflags', '+faststart', out])
    os.remove(inter)
    print('wrote', out)


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
