(function () {

  var responsiveStyle = document.createElement("style");
  responsiveStyle.id = "racewise-responsive-layout-v2";
  responsiveStyle.textContent = `
  /* RaceWise responsive layout: one desktop header system, existing mobile rules preserved. */
  @media (min-width:601px) {
    body > header.site-header,
    body > header.rw-cinematic-header,
    body > header:has(> .brand-wordmark) {
      position:relative;
      isolation:isolate;
      min-height:clamp(245px,28vw,340px);
      display:flex;
      flex-direction:column;
      justify-content:flex-end;
      align-items:stretch;
      padding:16px 0 0;
      background-position:center 42%;
      background-size:cover;
    }
    body > header.site-header > .brand,
    body > header.rw-cinematic-header > .brand,
    body > header:has(> .brand-wordmark) > .brand {
      position:absolute !important;
      top:0 !important;
      left:0 !important;
      right:auto !important;
      z-index:4;
      display:flex !important;
      align-items:flex-start !important;
      justify-content:flex-start !important;
      width:auto !important;
      max-width:calc(100% - 24px) !important;
      margin:0 !important;
      padding:0 !important;
      gap:clamp(10px,1.5vw,18px) !important;
    }
    body > header.site-header > .brand img,
    body > header.rw-cinematic-header > .brand img,
    body > header:has(> .brand-wordmark) > .brand img {
      display:block;
      width:clamp(160px,18vw,220px) !important;
      max-width:25vw !important;
      height:auto !important;
      object-fit:contain;
      flex:0 1 auto;
    }
    body > header:has(> .brand-wordmark) .brand-wordmark {
      flex:0 1 auto;
      width:auto;
      max-width:calc(100vw - 250px);
      min-width:0;
      margin:0;
    }
    body > header:has(> .brand-wordmark) .brand-name {
      font-size:clamp(28px,3.4vw,46px);
      line-height:1.05;
      white-space:nowrap;
      overflow-wrap:normal;
    }
    body > header.site-header > nav,
    body > header.rw-cinematic-header > nav,
    body > header:has(> .brand-wordmark) > nav {
      position:relative;
      z-index:5;
      display:flex;
      flex:0 0 auto;
      align-items:stretch;
      justify-content:space-evenly;
      flex-wrap:nowrap;
      gap:0;
      width:100%;
      margin:0;
      padding:5px 2px;
    }
    body > header.site-header > nav a,
    body > header.rw-cinematic-header > nav a,
    body > header:has(> .brand-wordmark) > nav a {
      display:flex;
      flex:1 1 0;
      min-width:0;
      align-items:center;
      justify-content:center;
      text-align:center;
      white-space:normal;
      overflow-wrap:anywhere;
      font-size:clamp(9px,.85vw,12px);
      line-height:1.2;
      padding:8px 4px;
    }
  }
  `;
  document.head.appendChild(responsiveStyle);

  var universalHeaderStyle = document.createElement("style");
  universalHeaderStyle.id = "racewise-universal-desktop-header";
  universalHeaderStyle.textContent = `
  /* Apply the same desktop header geometry to every public page with a branded header. */
  @media (min-width:601px) {
    body > header:has(> .brand):has(> nav) {
      position:relative;
      isolation:isolate;
      min-height:clamp(245px,28vw,340px);
      display:flex;
      flex-direction:column;
      justify-content:flex-end;
      align-items:stretch;
      padding:16px 0 0;
      background-position:center 42%;
      background-size:cover;
    }
    body > header:has(> .brand):has(> nav) > .brand {
      position:absolute !important;
      top:0 !important;
      left:0 !important;
      right:auto !important;
      z-index:4;
      display:flex !important;
      align-items:flex-start !important;
      justify-content:flex-start !important;
      width:auto !important;
      max-width:calc(100% - 24px) !important;
      margin:0 !important;
      padding:0 !important;
      gap:clamp(10px,1.5vw,18px) !important;
    }
    body > header:has(> .brand):has(> nav) > .brand img {
      display:block;
      width:clamp(160px,18vw,220px) !important;
      max-width:25vw !important;
      height:auto !important;
      object-fit:contain;
      flex:0 1 auto;
    }
    body > header:has(> .brand):has(> nav) > nav {
      position:relative;
      z-index:5;
      display:flex;
      flex:0 0 auto;
      align-items:stretch;
      justify-content:space-evenly;
      flex-wrap:nowrap;
      gap:0;
      width:100%;
      margin:0;
      padding:5px 2px;
    }
    body > header:has(> .brand):has(> nav) > nav a {
      display:flex;
      flex:1 1 0;
      min-width:0;
      align-items:center;
      justify-content:center;
      text-align:center;
      white-space:normal;
      overflow-wrap:anywhere;
      font-size:clamp(9px,.85vw,12px);
      line-height:1.2;
      padding:8px 4px;
    }
  }
  `;
  document.head.appendChild(universalHeaderStyle);


  if (document.getElementById("racewise-floating-logo")) return;
  var link = document.createElement("a");
  link.id = "racewise-floating-logo";
  link.href = "/";
  link.setAttribute("aria-label", "RaceWise India home");
  link.style.cssText = "position:fixed;right:18px;bottom:18px;z-index:99999;display:block;width:clamp(58px,8vw,92px);height:auto;padding:0;margin:0;background:transparent;border:0;border-radius:0;box-shadow:none;line-height:0;opacity:1;";
  var img = document.createElement("img");
  img.src = "https://raw.githubusercontent.com/racewiseindia/racewiseindia.github.io/main/BD3FBD67-3641-4C4B-A7C4-65B776CDC953.png";
  img.alt = "RaceWise India original gold horse and rider logo";
  img.style.cssText = "display:block;width:100%;height:auto;max-width:none;object-fit:contain;background:transparent;border:0;border-radius:0;box-shadow:none;";
  link.appendChild(img);
  document.body.appendChild(link);
  var style = document.createElement("style");
  style.textContent = "@media(max-width:600px){#racewise-floating-logo{right:12px!important;bottom:12px!important;width:62px!important}}";
  document.head.appendChild(style);
})();