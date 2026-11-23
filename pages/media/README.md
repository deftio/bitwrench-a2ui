# Site media

Sample files for the gallery's Video and AudioPlayer components. Both were generated for this project with ffmpeg from its built-in test sources, so they contain no third-party material and are covered by the repository's Apache-2.0 license.

* `sample-video.mp4` - 5 s, 320x180, H.264 + AAC: ffmpeg's `testsrc2` pattern with a 440 Hz tone.
  `ffmpeg -f lavfi -i "testsrc2=size=320x180:rate=24:duration=5" -f lavfi -i "sine=frequency=440:duration=5:sample_rate=22050" -c:v libx264 -pix_fmt yuv420p -profile:v baseline -crf 30 -preset slow -c:a aac -b:a 48k -ac 1 -movflags +faststart -shortest -map_metadata -1 sample-video.mp4`
* `sample-audio.mp3` - 6 s, MP3: a four-note C major chime.
  `ffmpeg -f lavfi -i "aevalsrc='0.35*sin(2*PI*(if(lt(t,1.5),523.25,if(lt(t,3),659.25,if(lt(t,4.5),783.99,1046.5))))*t)*exp(-1.6*mod(t,1.5))':s=22050:d=6" -c:a libmp3lame -b:a 48k -ac 1 -map_metadata -1 sample-audio.mp3`
