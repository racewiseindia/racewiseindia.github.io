(function () {
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