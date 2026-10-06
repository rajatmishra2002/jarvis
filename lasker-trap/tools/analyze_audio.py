"""Audio analysis for the Lasker Trap edit.
Writes data/audio_events.json:
  env   : per-frame (60 Hz) normalised band envelopes  [bass, mid, high, rms]
  onsets: strong onsets per band (time, strength) used to snap moves / drive pulses
"""
import json, subprocess, sys, numpy as np, librosa
from scipy.signal import find_peaks

FPS = 60
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', 'data/song.mp3', '-ac', '1', '-ar', '22050', '/tmp/song_mono.wav'], check=True)
y, sr = librosa.load('/tmp/song_mono.wav', sr=22050)
dur = len(y) / sr
hop = 256
D = np.abs(librosa.stft(y, n_fft=2048, hop_length=hop))
fr = librosa.fft_frequencies(sr=sr, n_fft=2048)
tt = librosa.frames_to_time(np.arange(D.shape[1]), sr=sr, hop_length=hop)

def band(lo, hi):
    return D[(fr >= lo) & (fr < hi)].sum(0)

bands = {'bass': band(25, 180), 'mid': band(180, 3000), 'high': band(3000, 10000)}
env = {}
nf = int(dur * FPS) + 2
tf = np.arange(nf) / FPS
for k, v in bands.items():
    e = np.interp(tf, tt, v)
    # smooth lightly, normalise to 0..1 by 98th percentile
    e = np.convolve(e, np.ones(3) / 3, mode='same')
    e = np.clip(e / np.percentile(e, 98), 0, 1.2)
    env[k] = np.round(e, 3).tolist()
rms = librosa.feature.rms(y=y, hop_length=hop)[0]
e = np.interp(tf, tt[:len(rms)], rms); e = np.clip(e / np.percentile(e, 98), 0, 1.2)
env['rms'] = np.round(e, 3).tolist()

def onsets(b, pct, dist=0.09):
    l = np.log1p(b * 2)
    o = np.maximum(0, np.diff(l, prepend=l[0]))
    pk, _ = find_peaks(o, height=np.percentile(o, pct), distance=int(dist * sr / hop))
    mx = o[pk].max()
    return [[round(float(tt[p]), 3), round(float(o[p] / mx), 3)] for p in pk]

ons = {'bass': onsets(bands['bass'], 97), 'mid': onsets(bands['mid'], 97.5), 'high': onsets(bands['high'], 98)}
json.dump({'fps': FPS, 'dur': dur, 'env': env, 'onsets': ons}, open('data/audio_events.json', 'w'))
print('dur', dur, {k: len(v) for k, v in ons.items()})
