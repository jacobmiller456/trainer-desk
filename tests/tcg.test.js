const { chromium } = require('playwright');
const path = require('path');
(async()=>{
  const b = await chromium.launch(); const page = await b.newPage();
  const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  const cors={'access-control-allow-origin':'*'};
  await page.route('**/*', r=>{
    const u=r.request().url();
    if(u.startsWith('file://')) return r.continue();
    if(u.startsWith('https://api.pokemontcg.io/v2/sets')) return r.fulfill({status:200,headers:cors,contentType:'application/json',body:JSON.stringify({data:[{id:'liv1',name:'Live Set One',releaseDate:'2025/01/01'},{id:'liv2',name:'Live Set Two',releaseDate:'2024/01/01'}]})});
    if(u.startsWith('https://api.pokemontcg.io/v2/cards')) return r.fulfill({status:200,headers:cors,contentType:'application/json',body:JSON.stringify({data:[{id:'a',name:'Live Card A',number:'1',rarity:'Rare',images:{small:'data:image/gif;base64,R0lGODlhAQABAAAAACw='}},{id:'b',name:'Live Card B',number:'2',rarity:'Common',images:{small:'data:image/gif;base64,R0lGODlhAQABAAAAACw='}}]})});
    return r.abort();
  });
  await page.goto('file://'+path.resolve(process.argv[2]));
  await page.click('button[data-view="tcg"]');
  await page.waitForFunction(()=>document.querySelectorAll('#card-grid .tcard').length===2,null,{timeout:8000});
  const status=await page.textContent('#tcg-status');
  const opts=await page.$$eval('#set-select option',o=>o.map(x=>x.textContent));
  const names=await page.$$eval('#card-grid .nm',n=>n.map(x=>x.textContent));
  console.log({status,opts,names,errors});
  const ok=status==='2 cards'&&opts.length===2&&names[0]==='Live Card A'&&!errors.length;
  console.log(ok?'PASS tcg live path':'FAIL tcg live path'); await b.close(); process.exit(ok?0:1);
})();
