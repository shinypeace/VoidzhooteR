// Derive UV rectangles from alpha islands, excluding neighbouring-cell tips.
// This changes sprite metadata only; the generated PNG masters stay untouched.
const sharp = require(process.env.SHARP_MODULE || 'C:/Users/pavel/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');
const fs = require('node:fs');
const layouts = [['voidstorm-atlas',5,5],['expansion-atlas',4,4],['projectile-atlas',4,4],['reinforcements-atlas',2,4],['frontier-atlas',4,3]];
(async () => {
  const manifest = [];
  for (const [name, cols, rows] of layouts) {
    const { data, info } = await sharp(`assets/${name}.png`).ensureAlpha().raw().toBuffer({ resolveWithObject:true });
    const {width:w,height:h} = info, seen = new Uint8Array(w*h), queue = new Int32Array(w*h), components=[];
    for(let pixel=0;pixel<w*h;pixel++) {
      if(seen[pixel] || data[pixel*4+3]<100)continue;
      let read=0,write=1,minX=w,minY=h,maxX=0,maxY=0;queue[0]=pixel;seen[pixel]=1;
      while(read<write) {
        const p=queue[read++],x=p%w,y=Math.floor(p/w);minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);
        for(const next of [x>0?p-1:-1,x<w-1?p+1:-1,y>0?p-w:-1,y<h-1?p+w:-1]) if(next>=0&&!seen[next]&&data[next*4+3]>=100){seen[next]=1;queue[write++]=next;}
      }
      if(write>150)components.push({x:minX,y:minY,w:maxX-minX+1,h:maxY-minY+1,area:write});
    }
    const frames=[];
    for(let i=0;i<cols*rows;i++) {
      if(name==='projectile-atlas') { frames.push([Math.round(i%cols*w/cols)+4,Math.round(Math.floor(i/cols)*h/rows)+4,Math.floor(w/cols)-8,Math.floor(h/rows)-8]);continue; }
      const cx=(i%cols+.5)*w/cols,cy=(Math.floor(i/cols)+.5)*h/rows;
      const candidates=components.filter(c=>Math.abs(c.x+c.w/2-cx)<w/cols*.48&&Math.abs(c.y+c.h/2-cy)<h/rows*.48).sort((a,b)=>b.area-a.area);
      const c=candidates[0];if(!c)throw Error(`${name} cell ${i}: missing alpha island`);
      const x=Math.max(0,c.x-2),y=Math.max(0,c.y-2);
      frames.push([x,y,Math.min(w-x,c.w+4),Math.min(h-y,c.h+4)]);
    }
    manifest.push(frames);console.log(name,JSON.stringify(frames));
  }
  fs.writeFileSync('js/atlas-frames.js','/* Generated UV bounds; see tools/build-atlas-manifest.cjs. */\nconst ATLAS_FRAMES = '+JSON.stringify(manifest)+';\n');
})().catch(e=>{console.error(e);process.exitCode=1;});
