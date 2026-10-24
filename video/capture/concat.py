import json,sys,os
d=sys.argv[1]
j=json.load(open(os.path.join(d,'frames.json')))
f=j['frames'];e=j['events']
print('first frame',f[0],'start',e['start'],'delta',f[0]-e['start'])
t0=f[0]
with open(os.path.join(d,'list.txt'),'w') as o:
  for i,t in enumerate(f):
    nxt=f[i+1] if i+1<len(f) else t+1/30
    o.write(f"file 'frames/{i:05d}.jpg'\nduration {max(0.001,nxt-t):.4f}\n")
  o.write(f"file 'frames/{len(f)-1:05d}.jpg'\n")
rel={k:round(v-t0,3) for k,v in e.items()}
json.dump(rel,open(os.path.join(d,'events.rel.json'),'w'),indent=1)
print(rel)
