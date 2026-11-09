/**
 * The style sheet of a funnel page, scoped under .fp. The site template draws the page with this same sheet
 * (scripts/page.css in the template repo), so the editor preview and the live site look alike. If you change one,
 * change the other.
 */
export const FUNNEL_CSS = `.fp{--ink:#1c1b16;--body:#57534a;--bg:#f4f1e8;--alt:#eae4d4;--card:#fefdf8;--line:rgba(28,27,22,.14);--accent:#1D6A58;--radius:14px;--btn:999px;--font:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;--head:var(--font);margin:0;font:17px/1.6 var(--font);color:var(--ink);background:var(--bg)}
.fp[data-font=serif]{--head:Georgia,"Times New Roman",serif}
.fp[data-radius=square]{--radius:3px;--btn:3px}.fp[data-radius=round]{--radius:22px;--btn:999px}.fp[data-radius=soft]{--radius:14px;--btn:999px}
.fp *{box-sizing:border-box}
.fp .wrap{max-width:1040px;margin:0 auto;padding:0 20px}.fp .narrow{max-width:720px}.fp .wide{max-width:1040px}
.fp header.top{padding:18px 0}.fp header.top .wrap{display:flex;align-items:center;justify-content:space-between;gap:16px}
.fp .logo{font-weight:700;font-size:20px;letter-spacing:-.01em;font-family:var(--head)}
.fp .btn{display:inline-block;background:var(--accent);color:#fff;border:0;border-radius:var(--btn);padding:13px 26px;font:600 16px system-ui,sans-serif;text-decoration:none;cursor:pointer}
.fp .btn:hover{opacity:.9}.fp .btn.ghost{background:transparent;color:inherit;border:1.5px solid currentColor}
.fp h1,.fp h2,.fp h3{font-family:var(--head);color:inherit}
.fp h1{font-size:clamp(34px,6vw,56px);line-height:1.08;letter-spacing:-.02em;margin:0 0 18px}
.fp h2{font-size:30px;line-height:1.15;letter-spacing:-.01em;margin:0 0 16px}
.fp h3{font-size:20px;line-height:1.25;margin:0 0 8px}
.fp p{margin:0 0 14px;color:var(--body)}
.fp .eyebrow{font:600 13px/1 system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:var(--accent);margin:0 0 14px}
.fp .tone-plain{background:var(--bg);color:var(--ink)}.fp .tone-alt{background:var(--alt);color:var(--ink)}
.fp .tone-dark{background:#1c1b16;color:#f4f1e8}.fp .tone-dark p,.fp .tone-dark li{color:rgba(244,241,232,.78)}.fp .tone-dark .eyebrow{color:#e9d8a6}
.fp .tone-accent{background:var(--accent);color:#fff}.fp .tone-accent p,.fp .tone-accent li{color:rgba(255,255,255,.88)}.fp .tone-accent .eyebrow{color:rgba(255,255,255,.8)}
.fp .tone-accent .btn{background:#fff;color:var(--accent)}.fp .tone-dark .btn{background:#f4f1e8;color:#1c1b16}
.fp .hero{padding:64px 0 76px}.fp .hero.center{text-align:center}.fp .hero.center .lead{margin-left:auto;margin-right:auto}
.fp .hero .lead{font-size:20px;max-width:640px;margin:0 0 28px}
.fp .hero-grid{display:grid;gap:40px;align-items:center}
@media(min-width:860px){.fp .hero-grid.has-img{grid-template-columns:1.1fr .9fr}}
.fp .shot{display:block;width:100%;height:auto;border-radius:var(--radius);box-shadow:0 18px 50px rgba(28,27,22,.18)}
.fp .band{padding:60px 0}
.fp .split{display:grid;gap:36px;align-items:center}
@media(min-width:860px){.fp .split.has-img{grid-template-columns:1fr 1fr}}
.fp .ticks{list-style:none;padding:0;margin:18px 0 0}
.fp .ticks li{position:relative;padding-left:30px;margin:10px 0}
.fp .ticks li:before{content:"";position:absolute;left:0;top:7px;width:16px;height:9px;border-left:3px solid var(--accent);border-bottom:3px solid var(--accent);transform:rotate(-45deg)}
.fp .tone-accent .ticks li:before{border-color:#fff}.fp .tone-dark .ticks li:before{border-color:#e9d8a6}
.fp .intro{max-width:620px}
.fp .cards{display:grid;gap:18px;margin-top:26px}
@media(min-width:700px){.fp .cards.c2{grid-template-columns:repeat(2,1fr)}.fp .cards.c3{grid-template-columns:repeat(3,1fr)}}
.fp .card{background:var(--card);color:var(--ink);border:1px solid var(--line);border-radius:var(--radius);padding:22px}
.fp .card p{margin:0}.fp .card .ico{display:inline-flex;align-items:center;justify-content:center;width:38px;height:38px;border-radius:50%;background:var(--accent);color:#fff;font:700 16px system-ui;margin-bottom:12px}
.fp .tone-dark .card{background:rgba(255,255,255,.07);border-color:rgba(255,255,255,.14);color:#f4f1e8}.fp .tone-dark .card p{color:rgba(244,241,232,.78)}
.fp .tone-accent .card{background:rgba(255,255,255,.12);border-color:rgba(255,255,255,.25);color:#fff}.fp .tone-accent .card p{color:rgba(255,255,255,.9)}.fp .tone-accent .card .ico{background:#fff;color:var(--accent)}
.fp .steps{list-style:none;padding:0;margin:26px 0 0;display:grid;gap:18px;counter-reset:s}
.fp .steps li{position:relative;padding-left:58px;counter-increment:s}
.fp .steps li:before{content:counter(s);position:absolute;left:0;top:0;width:40px;height:40px;border-radius:50%;background:var(--accent);color:#fff;font:700 17px/40px system-ui;text-align:center}
.fp .tone-accent .steps li:before{background:#fff;color:var(--accent)}.fp .tone-dark .steps li:before{background:#f4f1e8;color:#1c1b16}
.fp .steps li p{margin:0}
.fp details{background:var(--card);color:var(--ink);border:1px solid var(--line);border-radius:var(--radius);padding:14px 18px;margin:10px 0}
.fp summary{cursor:pointer;font-weight:600}.fp details p{margin:10px 0 0}
.fp .tone-dark details{background:rgba(255,255,255,.07);border-color:rgba(255,255,255,.14);color:#f4f1e8}
.fp .cta{padding:64px 0;text-align:center}.fp .cta .intro{margin:0 auto 22px}
.fp form{display:grid;gap:14px}.fp label{display:grid;gap:6px;font-weight:600;font-size:15px}
.fp input,.fp textarea{font:inherit;padding:11px 13px;border:1px solid rgba(28,27,22,.25);border-radius:10px;background:var(--card);color:var(--ink)}
.fp input:focus,.fp textarea:focus{outline:2px solid var(--accent);outline-offset:1px}
.fp .fine{font-size:13px;color:var(--body);margin:0}.fp .check{display:flex;gap:10px;align-items:flex-start;font-weight:400}.fp .check input{margin-top:5px}
.fp .hp{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}.fp .contact{margin-top:18px}.fp .contact a{color:var(--accent);font-weight:600}
.fp footer.foot{padding:28px 0;font-size:14px;color:var(--body)}.fp footer.foot a{color:inherit}
.fp [hidden]{display:none!important}
.fp[data-font=rounded]{--font:ui-rounded,"Nunito","Segoe UI",system-ui,sans-serif;--head:var(--font)}
.fp[data-font=mono]{--font:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;--head:var(--font)}
.fp [data-space=compact]{padding-top:30px!important;padding-bottom:30px!important}.fp [data-space=roomy]{padding-top:104px!important;padding-bottom:104px!important}
.fp .hero.center .row,.fp .center .row{justify-content:center}.fp .row{display:flex;flex-wrap:wrap;gap:12px;align-items:center}
.fp .center{text-align:center}.fp .center .intro,.fp .center .lead{margin-left:auto;margin-right:auto}.fp .center .ticks{display:inline-block;text-align:left}
.fp .split.rev .pic{order:-1}
.fp .quotes{display:grid;gap:18px;margin-top:26px}@media(min-width:760px){.fp .quotes{grid-template-columns:repeat(auto-fit,minmax(280px,1fr))}}
.fp blockquote{margin:0;background:var(--card);color:var(--ink);border:1px solid var(--line);border-radius:var(--radius);padding:22px}
.fp blockquote p{color:inherit;font-size:18px;margin:0 0 14px}.fp blockquote footer{font-size:14px;color:var(--body)}.fp blockquote footer b{color:var(--ink)}
.fp .tone-dark blockquote{background:rgba(255,255,255,.07);border-color:rgba(255,255,255,.14);color:#f4f1e8}.fp .tone-dark blockquote footer,.fp .tone-dark blockquote footer b{color:rgba(244,241,232,.8)}
.fp .tone-accent blockquote{background:rgba(255,255,255,.12);border-color:rgba(255,255,255,.25);color:#fff}.fp .tone-accent blockquote footer,.fp .tone-accent blockquote footer b{color:#fff}
.fp .stats{display:grid;gap:22px;margin-top:26px;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));text-align:center}
.fp .stat b{display:block;font:700 clamp(34px,5vw,52px)/1.05 var(--head);color:var(--accent);margin-bottom:6px}.fp .stat span{font-size:15px;opacity:.85}
.fp .tone-dark .stat b{color:#e9d8a6}.fp .tone-accent .stat b{color:#fff}
.fp figure{margin:0}.fp figure img{display:block;width:100%;height:auto;border-radius:var(--radius)}.fp figcaption{font-size:14px;color:var(--body);margin-top:10px;text-align:center}
.fp .media{position:relative;width:100%;border-radius:var(--radius);overflow:hidden;background:#0003}.fp .media.video{aspect-ratio:16/9}.fp .media iframe,.fp .media video{position:absolute;inset:0;width:100%;height:100%;border:0}
.fp .media.frame{height:var(--h,600px)}.fp .media.frame iframe{position:static;height:100%}
.fp .eyebrow+h2{margin-top:0}
.fp .band.tight{padding:22px 0}
@media(min-width:900px){.fp .cards.c4{grid-template-columns:repeat(4,1fr)}}
`;

export const ACCENTS: Record<string, string> = { green: '#1D6A58', blue: '#1F5FBF', terracotta: '#B5472B', purple: '#6B3FA0', ink: '#1c1b16' };
