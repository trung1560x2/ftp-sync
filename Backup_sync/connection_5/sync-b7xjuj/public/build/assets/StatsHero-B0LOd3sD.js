import{r,j as e}from"./app-D5tv4Wec.js";import{c as B}from"./createLucideIcon-tWAhjcez.js";import{C as E}from"./camera-DG1KVsAp.js";import{S as F}from"./search-CfXu458A.js";/**
 * @license lucide-react v0.563.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const L=[["rect",{width:"18",height:"18",x:"3",y:"3",rx:"2",key:"afitv7"}],["path",{d:"M7 3v18",key:"bbkbws"}],["path",{d:"M3 7.5h4",key:"zfgn84"}],["path",{d:"M3 12h18",key:"1i2n21"}],["path",{d:"M3 16.5h4",key:"1230mu"}],["path",{d:"M17 3v18",key:"in4fa5"}],["path",{d:"M17 7.5h4",key:"myr1c1"}],["path",{d:"M17 16.5h4",key:"go4c1d"}]],V=B("film",L);/**
 * @license lucide-react v0.563.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const A=[["line",{x1:"22",x2:"2",y1:"12",y2:"12",key:"1y58io"}],["path",{d:"M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z",key:"oot6mr"}],["line",{x1:"6",x2:"6.01",y1:"16",y2:"16",key:"sgf278"}],["line",{x1:"10",x2:"10.01",y1:"16",y2:"16",key:"1l4acy"}]],R=B("hard-drive",A);/**
 * @license lucide-react v0.563.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const H=[["path",{d:"m22 11-1.296-1.296a2.4 2.4 0 0 0-3.408 0L11 16",key:"9kzy35"}],["path",{d:"M4 8a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2",key:"1t0f0t"}],["circle",{cx:"13",cy:"7",r:"1",fill:"currentColor",key:"1obus6"}],["rect",{x:"8",y:"2",width:"14",height:"14",rx:"2",key:"1gvhby"}]],P=B("images",H),G=({value:l,duration:c=2e3,formatFn:w=u=>u,decimals:x=0})=>{const[u,j]=r.useState(0),h=r.useRef(0),t=r.useRef(null),p=r.useRef(null);r.useEffect(()=>{t.current=null,h.current=0;const d=N=>{t.current||(t.current=N);const f=Math.min((N-t.current)/c,1),_=1-Math.pow(1-f,3),v=l*_;h.current=v,j(v),f<1?p.current=requestAnimationFrame(d):j(l)};return p.current=requestAnimationFrame(d),()=>{p.current&&cancelAnimationFrame(p.current)}},[l,c]);const k=x>0?u.toFixed(x):Math.floor(u);return e.jsx("span",{children:w(k)})},W=({label:l,value:c,Icon:w,iconColor:x="text-white",bgGradient:u="from-blue-500 to-cyan-500",detail:j,subDetail:h,delay:t=0,isNumeric:p=!0,onClick:k,forceVisible:d=!1})=>{const[N,f]=r.useState(!1),[_,v]=r.useState(!1),[S,q]=r.useState({x:0,y:0}),o=r.useRef(null),I=n=>{if(!o.current)return;const i=o.current.getBoundingClientRect(),M=n.clientX-i.left,C=n.clientY-i.top,$=i.width/2,z=i.height/2,X=(C-z)/z*-10,T=(M-$)/$*10;q({x:X,y:T})},g=()=>{f(!1),q({x:0,y:0})};return r.useEffect(()=>{if(d){const i=setTimeout(()=>v(!0),t);return()=>clearTimeout(i)}const n=new IntersectionObserver(([i])=>{if(i.isIntersecting){const M=setTimeout(()=>v(!0),t);return n.unobserve(i.target),()=>clearTimeout(M)}},{threshold:0});return o.current&&n.observe(o.current),()=>n.disconnect()},[t,d]),e.jsxs(e.Fragment,{children:[e.jsx("style",{dangerouslySetInnerHTML:{__html:`
                @keyframes float-particle {
                    0% { transform: translateY(0) scale(1); opacity: 0; }
                    50% { opacity: 0.5; }
                    100% { transform: translateY(-40px) scale(0.5); opacity: 0; }
                }
                .stat-card-particle {
                    position: absolute;
                    width: 2px;
                    height: 2px;
                    background: white;
                    border-radius: 50%;
                    pointer-events: none;
                    animation: float-particle 3s infinite linear;
                }
                .aurora-border {
                    position: absolute;
                    inset: -1px;
                    border-radius: inherit;
                    padding: 1px;
                    background: linear-gradient(90deg, #22d3ee, #c084fc, #f472b6, #22d3ee);
                    background-size: 200% 100%;
                    -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
                    -webkit-mask-composite: xor;
                    mask-composite: exclude;
                    opacity: 0;
                    transition: opacity 0.5s ease;
                }
                .group:hover .aurora-border {
                    opacity: 1;
                    animation: aurora-flow 3s linear infinite;
                }
                @keyframes aurora-flow {
                    0% { background-position: 0% 50%; }
                    100% { background-position: 200% 50%; }
                }
                .liquid-morph-entry {
                    clip-path: circle(0% at 50% 50%);
                    transition: clip-path 1.2s cubic-bezier(0.16, 1, 0.3, 1);
                }
                .liquid-morph-visible {
                    clip-path: circle(150% at 50% 50%);
                }
                .chromatic-aberration {
                    transition: text-shadow 0.3s ease, box-shadow 0.3s ease;
                }
                .group:hover .chromatic-aberration {
                    text-shadow: 1px 0 0 rgba(255,0,0,0.5), -1px 0 0 rgba(0,255,255,0.5);
                }
            `}}),e.jsxs("div",{ref:o,className:`stat-card group relative overflow-hidden bg-gradient-to-br rounded-lg p-2 shadow-lg transition-all duration-700 cursor-pointer border border-white/10 ring-1 ring-white/5 
                    ${_?"opacity-100 translate-y-0 scale-100 liquid-morph-visible":"opacity-0 translate-y-10 scale-95 liquid-morph-entry"}
                    ${N?"shadow-[2px_0_15px_rgba(255,0,0,0.2),-2px_0_15px_rgba(0,255,255,0.2)]":""}
                `,style:{backgroundImage:"linear-gradient(to bottom right, var(--tw-gradient-stops))",transitionDelay:`${t}ms`,transformStyle:"preserve-3d",transform:`perspective(1000px) rotateX(${S.x}deg) rotateY(${S.y}deg) scale(${N?1.05:1})`},onMouseMove:I,onMouseEnter:()=>f(!0),onMouseLeave:g,onClick:k,children:[e.jsx("div",{className:"aurora-border"}),e.jsx("div",{className:"absolute inset-0 bg-white/0 group-hover:bg-white/5 transition-colors duration-500"}),e.jsx("div",{className:"absolute -top-10 -right-10 w-24 h-24 bg-white/20 rounded-full blur-2xl group-hover:scale-150 group-hover:bg-purple-500/20 transition-all duration-1000 opacity-50"}),e.jsx("div",{className:"absolute -bottom-10 -left-10 w-24 h-24 bg-black/10 rounded-full blur-2xl group-hover:scale-150 group-hover:bg-cyan-500/20 transition-all duration-1000 opacity-30"}),e.jsx("div",{className:"absolute inset-0 overflow-hidden pointer-events-none",children:_&&[1,2,3,4,5].map(n=>e.jsx("div",{className:"stat-card-particle",style:{left:`${Math.random()*100}%`,bottom:"-5px",animationDelay:`${Math.random()*3}s`,opacity:Math.random()*.5}},n))}),e.jsx("div",{className:"absolute top-0 left-0 w-full h-1/2 bg-gradient-to-b from-white/10 to-transparent pointer-events-none"}),e.jsxs("div",{className:"relative z-10 transition-transform duration-500 group-hover:translate-z-20 group-hover:scale-[1.02]",children:[e.jsxs("div",{className:"flex items-start justify-between mb-2",children:[e.jsx("div",{className:"p-1.5 rounded-md bg-white/10 backdrop-blur-md shadow-inner ring-1 ring-white/30 transition-all duration-500 group-hover:scale-110 group-hover:rotate-6 group-hover:bg-white/20 group-hover:ring-white/50",children:e.jsx(w,{className:`w-3.5 h-3.5 ${x} drop-shadow-[0_0_5px_rgba(255,255,255,0.5)]`,strokeWidth:2.5})}),j&&e.jsx("div",{className:"text-[8px] font-semibold bg-black/40 backdrop-blur-md px-1.5 py-0.5 rounded-full text-white/90 border border-white/10 shadow-sm group-hover:bg-black/60 transition-colors tracking-wide",children:j})]}),e.jsx("div",{className:"mb-0.5",children:e.jsx("div",{className:"text-xl font-extrabold text-white tracking-tight drop-shadow-[0_2px_4px_rgba(0,0,0,0.3)] group-hover:scale-110 transition-transform duration-300 origin-left chromatic-aberration",children:p?e.jsx(G,{value:typeof c=="number"?c:0,duration:1500}):c})}),e.jsx("div",{className:"text-[9px] font-bold text-white/70 uppercase tracking-widest mb-1 shadow-black/20",children:l}),h&&e.jsxs("div",{className:"flex items-center gap-1.5",children:[e.jsx("div",{className:"h-[1px] w-3 bg-white/20 rounded-full group-hover:w-5 group-hover:bg-white/50 transition-all duration-500"}),e.jsx("div",{className:"text-[8px] font-medium text-white/60 group-hover:text-white transition-colors",children:h})]})]}),e.jsx("div",{className:"absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full group-hover:animate-[shimmer_2s_infinite] pointer-events-none"})]})]})},y=({className:l="w-5 h-3"})=>e.jsx("div",{className:`relative inline-flex items-center justify-center ${l}`,children:e.jsxs("svg",{viewBox:"0 0 32 16",fill:"none",className:"w-full h-full",children:[e.jsx("defs",{children:e.jsxs("linearGradient",{id:"cosmicGradient",x1:"0%",y1:"0%",x2:"100%",y2:"0%",children:[e.jsx("stop",{offset:"0%",className:"stop-1",stopColor:"#22d3ee"}),e.jsx("stop",{offset:"100%",className:"stop-2",stopColor:"#facc15"})]})}),e.jsx("path",{d:"M8 4C5.8 4 4 5.8 4 8s1.8 4 4 4c1.5 0 2.8-.8 3.5-2l.5-.8.5.8c.7 1.2 2 2 3.5 2 2.2 0 4-1.8 4-4s-1.8-4-4-4c-1.5 0-2.8.8-3.5 2l-.5.8-.5-.8C11.8 4.8 9.5 4 8 4z",stroke:"url(#cosmicGradient)",strokeWidth:"2.5",strokeLinecap:"round",className:"infinity-svg"})]})}),Q=({title:l="Thư viện của bạn",subtitle:c="Lưu giữ khoảnh khắc của bạn",searchValue:w,onSearchChange:x,onSearch:u,searchSuggestions:j=[],className:h=""})=>{const[t,p]=r.useState(null),[k,d]=r.useState(!0),[N,f]=r.useState(0),[_,v]=r.useState(""),[S,q]=r.useState([]),[o,I]=r.useState(!1),[g,n]=r.useState({x:50,y:50}),i=r.useRef(null),M=a=>{if(!i.current)return;const s=i.current.getBoundingClientRect(),b=(a.clientX-s.left)/s.width*100,D=(a.clientY-s.top)/s.height*100;n({x:b,y:D})};r.useEffect(()=>{const a=new IntersectionObserver(([s])=>{s.isIntersecting&&(I(!0),a.unobserve(s.target))},{threshold:.1});return i.current&&a.observe(i.current),()=>a.disconnect()},[k,t]);const C=w!==void 0,$=C?w:_,z=a=>{const s=a.target.value;C?x&&x(s):v(s)},X=()=>{u&&u($)};r.useEffect(()=>{T();const a=Array.from({length:50}).map((s,b)=>({id:b,top:`${Math.random()*100}%`,left:`${Math.random()*100}%`,size:`${Math.random()*2+1}px`,delay:`${Math.random()*3}s`,duration:`${Math.random()*3+2}s`}));q(a)},[]),r.useEffect(()=>{t&&setTimeout(()=>{f(Math.min(t.storage.used_percentage,100))},800)},[t]);const T=async()=>{try{const a=await fetch("/api/stats",{headers:{Accept:"application/json","X-Requested-With":"XMLHttpRequest"},credentials:"same-origin"});if(!a.ok){d(!1);return}const s=a.headers.get("content-type");if(!s||!s.includes("application/json")){d(!1);return}const b=await a.json();b.success&&p(b.stats)}catch(a){console.warn("Stats fetch skipped:",a.message)}finally{d(!1)}},m=a=>{if(!a||isNaN(a)||a===0)return"0 B";const s=1024,b=["B","KB","MB","GB","TB"],D=Math.floor(Math.log(a)/Math.log(s));return Math.round(a/Math.pow(s,D)*100)/100+" "+b[D]};if(k)return e.jsxs("div",{className:`relative overflow-hidden bg-slate-900 rounded-xl p-4 md:p-5 shadow-xl ${h}`,children:[e.jsx("div",{className:"absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-[#1a0b2e] to-black"}),e.jsxs("div",{className:"relative z-10 animate-pulse space-y-4",children:[e.jsxs("div",{className:"space-y-2",children:[e.jsx("div",{className:"h-6 bg-white/10 rounded-lg w-1/3"}),e.jsx("div",{className:"h-3 bg-white/10 rounded w-1/4"})]}),e.jsx("div",{className:"grid grid-cols-2 md:grid-cols-4 gap-3",children:[1,2,3,4].map(a=>e.jsx("div",{className:"h-24 bg-white/10 rounded-lg"},a))})]})]});if(!t)return null;const Y=[{label:"Tổng ảnh",value:t.images.total,Icon:P,iconColor:"text-cyan-200",bgGradient:"bg-white/5 backdrop-blur-sm border border-white/10 hover:bg-white/10 transition-all duration-300",detail:"Tất cả",subDetail:`${t.images.normal} thường • ${t.images.photoMode} Photo Mode`,isNumeric:!0},{label:"Shorts",value:t.shorts.total,Icon:V,iconColor:"text-purple-200",bgGradient:"bg-white/5 backdrop-blur-sm border border-white/10 hover:bg-white/10 transition-all duration-300",detail:"Video ngắn",subDetail:"Nội dung giải trí",isNumeric:!0},{label:"Photo Mode",value:t.images.photoMode,Icon:E,iconColor:"text-pink-200",bgGradient:"bg-white/5 backdrop-blur-sm border border-white/10 hover:bg-white/10 transition-all duration-300",detail:"Đặc biệt",subDetail:"Ảnh kèm nhạc nền",isNumeric:!0},{label:"Dung lượng",value:m(t.storage.total),Icon:R,iconColor:"text-amber-200",bgGradient:"bg-white/5 backdrop-blur-sm border border-white/10 hover:bg-white/10 transition-all duration-300",detail:t.storage.is_unlimited?e.jsxs("div",{className:"flex items-center gap-1.5 leading-none",children:[e.jsx(y,{className:"w-5 h-3"}),e.jsx("span",{className:"unlimited-shimmer tracking-tight text-sm uppercase",children:"Unlimited"})]}):`${t.storage.used_percentage.toFixed(1)}%`,subDetail:t.storage.is_unlimited?"Không giới hạn":`${m(t.storage.available||t.storage.quota-t.storage.total)} còn trống`,isNumeric:!1}];return e.jsxs("div",{ref:i,onMouseMove:M,className:`relative overflow-hidden bg-slate-950 rounded-2xl p-6 shadow-2xl ${h}`,children:[e.jsx("style",{children:`
                @keyframes twinkle {
                    0%, 100% { opacity: 0.2; transform: scale(0.8); }
                    50% { opacity: 1; transform: scale(1.2); }
                }

                @keyframes nebula-float {
                    0% { transform: translate(0, 0) scale(1); }
                    33% { transform: translate(30px, -50px) scale(1.1); }
                    66% { transform: translate(-20px, 20px) scale(0.9); }
                    100% { transform: translate(0, 0) scale(1); }
                }

                @keyframes shooting-star {
                    0% { transform: translateX(0) translateY(0) rotate(-45deg); opacity: 1; }
                    100% { transform: translateX(-500px) translateY(500px) rotate(-45deg); opacity: 0; }
                }
                
                @keyframes blackhole-spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }

                /* Black Hole Styles */
                .black-hole-container {
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%) scale(1.5);
                    width: 300px;
                    height: 300px;
                    z-index: 0;
                    opacity: 0.6;
                    pointer-events: none;
                }
                
                .gravitational-lensing {
                    position: absolute;
                    inset: -50px;
                    border-radius: 50%;
                    backdrop-filter: blur(8px) contrast(1.2) saturate(1.5);
                    mask-image: radial-gradient(circle, black 30%, transparent 70%);
                    z-index: 5;
                    pointer-events: none;
                }

                .black-hole-disk {
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%) perspective(400px) rotateX(75deg);
                    width: 100%;
                    height: 100%;
                    border-radius: 50%;
                    background: radial-gradient(circle closest-side, transparent 40%, rgba(168, 85, 247, 0.2) 45%, rgba(168, 85, 247, 0.8) 60%, transparent 80%);
                    box-shadow: 0 0 30px 10px rgba(168, 85, 247, 0.3);
                }
                
                .black-hole-disk::after {
                    content: '';
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    border-radius: 50%;
                    background: conic-gradient(from 0deg, transparent 0%, rgba(216, 180, 254, 0.4) 25%, transparent 50%, rgba(192, 132, 252, 0.4) 75%, transparent 100%);
                    animation: blackhole-spin 10s linear infinite;
                    mix-blend-mode: screen;
                }

                .event-horizon {
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    width: 80px;
                    height: 80px;
                    background: black;
                    border-radius: 50%;
                    box-shadow: 0 0 20px 2px rgba(168, 85, 247, 0.6), inset 0 0 10px rgba(255, 255, 255, 0.2);
                    z-index: 2;
                }
                
                /* The "halo" or gravitational lensing effect over the top */
                .accretion-halo {
                    position: absolute;
                    top: 38%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    width: 110px;
                    height: 40px;
                    border-radius: 50% 50% 0 0;
                    background: radial-gradient(circle at 50% 100%, rgba(216, 180, 254, 0.8) 0%, transparent 70%);
                    z-index: 1;
                    filter: blur(5px);
                    opacity: 0.8;
                }
                
                /* Bottom distortion */
                 .accretion-halo-bottom {
                    position: absolute;
                    top: 62%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    width: 110px;
                    height: 40px;
                    border-radius: 0 0 50% 50%;
                    background: radial-gradient(circle at 50% 0%, rgba(216, 180, 254, 0.8) 0%, transparent 70%);
                    z-index: 1;
                    filter: blur(5px);
                    opacity: 0.8;
                }

                @keyframes cosmic-pulse {
                    0%, 100% { box-shadow: 0 0 15px rgba(139, 92, 246, 0.3); }
                    50% { box-shadow: 0 0 30px rgba(139, 92, 246, 0.6); }
                }

                .star {
                    position: absolute;
                    background: white;
                    border-radius: 50%;
                    animation: twinkle infinite ease-in-out;
                }

                .nebula {
                    position: absolute;
                    filter: blur(80px);
                    opacity: 0.4;
                    animation: nebula-float 20s infinite ease-in-out;
                }

                .shooting-star-container {
                    position: absolute;
                    top: 0;
                    right: 0;
                    width: 100%;
                    height: 100%;
                    overflow: hidden;
                    pointer-events: none;
                }
                
                .shooting-star {
                    position: absolute;
                    top: 10%;
                    right: 10%;
                    width: 4px;
                    height: 4px;
                    background: #fff;
                    border-radius: 50%;
                    box-shadow: 0 0 0 4px rgba(255,255,255,0.1), 0 0 0 8px rgba(255,255,255,0.1), 0 0 20px rgba(255,255,255,1);
                    animation: shooting-star 3s linear infinite;
                    animation-delay: 2s;
                    opacity: 0;
                }

                .shooting-star::before {
                    content: '';
                    position: absolute;
                    top: 50%;
                    transform: translateY(-50%);
                    right: 0;
                    width: 300px;
                    height: 1px;
                    background: linear-gradient(90deg, rgba(255,255,255,1), transparent);
                }

                /* Progress Bar & Liquid Energy */
                @keyframes liquid-wave {
                    0% { transform: translateX(-100%) skewX(-15deg); }
                    50% { transform: translateX(0%) skewX(0deg); }
                    100% { transform: translateX(100%) skewX(15deg); }
                }
                
                @keyframes energy-pulse {
                    0%, 100% { opacity: 0.3; filter: brightness(1); }
                    50% { opacity: 0.8; filter: brightness(1.5); }
                }

                @keyframes wave-move {
                    0% { transform: translateX(-50%) translateZ(0) scaleY(1); }
                    50% { transform: translateX(-25%) translateZ(0) scaleY(0.85); }
                    100% { transform: translateX(0%) translateZ(0) scaleY(1); }
                }

                .liquid-container {
                    position: relative;
                    width: 100%;
                    height: 100%;
                    overflow: hidden;
                    border-radius: inherit;
                    filter: url('#liquid-goo'); /* Apply SVG filter for liquid effect */
                }

                .liquid-wave {
                    position: absolute;
                    top: -100%;
                    left: -50%;
                    width: 200%;
                    height: 300%;
                    background: inherit;
                    border-radius: 40%;
                    animation: wave-move 5s infinite linear;
                    opacity: 0.6;
                }

                .liquid-wave:nth-child(2) {
                    animation-duration: 7s;
                    opacity: 0.3;
                    border-radius: 35%;
                }

                .glass-panel {
                    background: rgba(255, 255, 255, 0.03);
                    backdrop-filter: blur(16px);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    box-shadow: 0 4px 30px rgba(0, 0, 0, 0.1);
                    transition: all 0.3s ease;
                }
                .perspective-1000 {
                    perspective: 1000px;
                }

                /* Infinity Icon Specific Styles */
                @keyframes infinity-flow {
                    0% { stroke-dashoffset: 100; filter: drop-shadow(0 0 2px #22d3ee); }
                    50% { filter: drop-shadow(0 0 8px #f472b6); }
                    100% { stroke-dashoffset: 0; filter: drop-shadow(0 0 2px #22d3ee); }
                }
                @keyframes gradient-shift {
                    0% { stop-color: #22d3ee; }
                    33% { stop-color: #c084fc; }
                    66% { stop-color: #f472b6; }
                    100% { stop-color: #facc15; }
                }
                @keyframes unlimited-shine {
                    0% { background-position: -200% center; opacity: 0.8; }
                    50% { opacity: 1; }
                    100% { background-position: 200% center; opacity: 0.8; }
                }
                @keyframes shimmer {
                    0% { transform: translateX(-100%); }
                    100% { transform: translateX(100%); }
                }
                .unlimited-shimmer {
                    background: linear-gradient(
                        90deg, 
                        rgba(34, 211, 238, 0.8) 0%, 
                        rgba(192, 132, 252, 1) 25%, 
                        rgba(244, 114, 182, 1) 50%, 
                        rgba(192, 132, 252, 1) 75%, 
                        rgba(34, 211, 238, 0.8) 100%
                    );
                    background-size: 200% auto;
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                    animation: unlimited-shine 4s linear infinite;
                    font-weight: 800;
                    text-shadow: 0 0 15px rgba(168, 85, 247, 0.3);
                }
                .infinity-svg {
                    stroke-dasharray: 50;
                    animation: infinity-flow 3s linear infinite;
                }
                .stop-1 { animation: gradient-shift 4s infinite alternate; }
                .stop-2 { animation: gradient-shift 4s infinite alternate-reverse; }
            `}),e.jsx("svg",{style:{position:"absolute",width:0,height:0},children:e.jsx("defs",{children:e.jsxs("filter",{id:"liquid-goo",children:[e.jsx("feGaussianBlur",{in:"SourceGraphic",stdDeviation:"5",result:"blur"}),e.jsx("feColorMatrix",{in:"blur",mode:"matrix",values:"1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -7",result:"goo"}),e.jsx("feComposite",{in:"SourceGraphic",in2:"goo",operator:"atop"})]})})}),e.jsx("div",{className:"absolute inset-0 z-0 transition-opacity duration-1000",style:{background:`
                        radial-gradient(120% 120% at ${g.x}% ${g.y}%, #1e1b4b 0%, #0f172a 50%, #020617 100%),
                        radial-gradient(circle at ${g.x}% ${g.y}%, rgba(168, 85, 247, 0.15) 0%, transparent 50%),
                        radial-gradient(circle at ${100-g.x}% ${100-g.y}%, rgba(34, 211, 238, 0.1) 0%, transparent 50%)
                    `,backgroundBlendMode:"screen"}}),e.jsxs("div",{className:"black-hole-container",children:[e.jsx("div",{className:"gravitational-lensing"}),e.jsx("div",{className:"black-hole-disk"}),e.jsx("div",{className:"accretion-halo"}),e.jsx("div",{className:"accretion-halo-bottom"}),e.jsx("div",{className:"event-horizon"})]}),e.jsx("div",{className:"nebula w-96 h-96 bg-fuchsia-600/30 top-[-20%] left-[10%] rounded-full mix-blend-screen",style:{animationDelay:"0s"}}),e.jsx("div",{className:"nebula w-80 h-80 bg-blue-600/30 bottom-[-10%] right-[10%] rounded-full mix-blend-screen",style:{animationDelay:"-5s"}}),e.jsx("div",{className:"nebula w-64 h-64 bg-purple-600/20 top-[40%] left-[40%] rounded-full mix-blend-screen",style:{animationDelay:"-10s"}}),e.jsx("div",{className:"absolute inset-0 z-0 opacity-70",children:S.map(a=>e.jsx("div",{className:"star",style:{top:a.top,left:a.left,width:a.size,height:a.size,animationDelay:a.delay,animationDuration:a.duration}},a.id))}),e.jsxs("div",{className:"shooting-star-container z-0",children:[e.jsx("div",{className:"shooting-star",style:{top:"15%",right:"20%",animationDelay:"4s"}}),e.jsx("div",{className:"shooting-star",style:{top:"45%",right:"5%",animationDelay:"8s"}})]}),e.jsxs("div",{className:"relative z-10",children:[e.jsxs("div",{className:`mb-6 transition-all duration-700 ${o?"opacity-100 translate-y-0":"opacity-0 -translate-y-4"}`,children:[e.jsx("h2",{className:"text-3xl font-bold text-white mb-2 tracking-tight drop-shadow-lg",children:e.jsx("span",{className:"bg-clip-text text-transparent bg-gradient-to-r from-blue-200 via-white to-purple-200",children:l})}),e.jsxs("p",{className:"text-blue-200/80 text-sm flex items-center gap-2",children:[e.jsxs("span",{className:"relative flex h-2 w-2",children:[e.jsx("span",{className:"animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"}),e.jsx("span",{className:"relative inline-flex rounded-full h-2 w-2 bg-cyan-500"})]}),c]})]}),e.jsx("div",{className:"grid grid-cols-2 md:grid-cols-4 gap-3 mb-6",children:Y.map((a,s)=>e.jsx("div",{className:"perspective-1000 min-h-[100px]",children:e.jsx(W,{...a,delay:s*150,forceVisible:o})},a.label))}),e.jsxs("div",{className:`glass-panel rounded-xl p-4 mb-4 border border-white/5 transition-all duration-1000 delay-[600ms] ${o?"opacity-100 translate-y-0":"opacity-0 translate-y-8"}`,children:[e.jsxs("div",{className:"flex items-center justify-between mb-3",children:[e.jsxs("div",{className:"flex items-center gap-2",children:[e.jsx("div",{className:"p-1.5 rounded-lg bg-indigo-500/20 text-indigo-300 group-hover:scale-110 transition-transform duration-500",children:e.jsx(R,{className:"w-4 h-4"})}),e.jsxs("div",{children:[e.jsx("span",{className:"text-sm font-semibold text-white block",children:t.storage.is_unlimited?"Dung lượng không giới hạn":"Dung lượng đã sử dụng"}),e.jsxs("span",{className:"text-[10px] text-white/50 uppercase tracking-wider flex items-center gap-1",children:[m(t.storage.used||t.storage.total||0)," /"," ",t.storage.is_unlimited?e.jsxs(e.Fragment,{children:[e.jsx(y,{className:"w-4 h-2.5"})," ",e.jsx("span",{className:"unlimited-shimmer",children:"Unlimited"})]}):t.storage.quota?m(t.storage.quota):e.jsx(y,{className:"w-4 h-2.5"})]})]})]}),e.jsx("span",{className:"text-lg font-bold text-white",children:t.storage.is_unlimited?e.jsx("span",{className:"text-emerald-400 flex items-center",children:e.jsx(y,{className:"w-8 h-4"})}):e.jsx(G,{value:t.storage.used_percentage,duration:2e3,decimals:1,formatFn:a=>`${a}%`})})]}),e.jsxs("div",{className:"relative h-4 bg-slate-800/50 rounded-full overflow-hidden shadow-inner mb-4 ring-1 ring-white/5 group/energy",children:[e.jsxs("div",{className:`absolute top-0 left-0 h-full rounded-full transition-all duration-1000 ease-out 
                                ${t.storage.is_unlimited?"bg-emerald-500":t.storage.used_percentage>90?"bg-red-500":t.storage.used_percentage>70?"bg-amber-500":"bg-blue-600"}
                            `,style:{width:t.storage.is_unlimited?"100%":`${o?Math.max(t.storage.used_percentage||0,2):0}%`,transitionDelay:"800ms"},children:[e.jsx("div",{className:"liquid-container",children:e.jsxs("div",{className:`absolute inset-0 opacity-100 transition-all duration-500
                                        ${t.storage.is_unlimited?"bg-gradient-to-r from-emerald-400 via-teal-400 to-cyan-400":t.storage.used_percentage>90?"bg-gradient-to-r from-red-500 via-orange-500 to-rose-500":t.storage.used_percentage>70?"bg-gradient-to-r from-amber-400 via-orange-400 to-yellow-500":"bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-600"}`,children:[e.jsx("div",{className:"liquid-wave group-hover/energy:animate-[wave-move_2s_infinite_linear]"}),e.jsx("div",{className:"liquid-wave group-hover/energy:animate-[wave-move_3s_infinite_linear]"}),e.jsx("div",{className:"absolute inset-0 bg-white/20 animate-pulse duration-[3000ms]"}),e.jsx("div",{className:"absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent -translate-x-full animate-[liquid-wave_3s_infinite_linear] group-hover/energy:duration-1000"})]})}),e.jsx("div",{className:"absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent opacity-0 group-hover/energy:opacity-100 transition-opacity duration-700"})]}),e.jsx("div",{className:"absolute inset-0 pointer-events-none rounded-full shadow-[inset_0_1px_4px_rgba(255,255,255,0.1)]"})]}),e.jsx("div",{className:"grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px] text-slate-300",children:[{label:"Ảnh",value:m(t.storage.images),color:"bg-cyan-400",shadow:"rgba(34,211,238,0.8)"},{label:"Video",value:m(t.storage.videos),color:"bg-purple-400",shadow:"rgba(192,132,252,0.8)"},{label:"Trống",value:t.storage.is_unlimited?e.jsx(y,{className:"w-5 h-3"}):m(t.storage.available||(t.storage.quota?t.storage.quota-t.storage.total:0)),color:"bg-emerald-400",shadow:"rgba(52,211,153,0.8)"},{label:"Tổng",value:t.storage.is_unlimited?e.jsxs(e.Fragment,{children:[e.jsx(y,{className:"w-5 h-3"})," ",e.jsx("span",{className:"unlimited-shimmer",children:"Unlimited"})]}):t.storage.quota?m(t.storage.quota):e.jsx(y,{className:"w-4 h-2.5"}),color:"bg-amber-400",shadow:"rgba(251,191,36,0.8)"}].map((a,s)=>e.jsxs("div",{className:`flex items-center gap-2 bg-white/5 backdrop-blur-sm p-2 rounded-lg border border-white/5 hover:bg-white/10 hover:border-white/20 group/detail transition-all duration-300 hover:-translate-y-0.5
                                    ${o?"opacity-100 translate-y-0":"opacity-0 translate-y-4"}
                                `,style:{transitionDelay:`${900+s*100}ms`},children:[e.jsx("div",{className:`w-1.5 h-1.5 rounded-full ${a.color} shadow-[0_0_5px_${a.shadow}] group-hover/detail:scale-150 transition-transform duration-500`}),e.jsxs("span",{className:"font-medium flex items-center gap-1",children:[a.label,": ",a.value]})]},a.label))})]}),e.jsxs("div",{className:`relative group transition-all duration-1000 delay-[1200ms] ${o?"opacity-100 translate-y-0":"opacity-0 translate-y-8"}`,children:[e.jsx("div",{className:"absolute -inset-0.5 bg-gradient-to-r from-cyan-500 to-purple-600 rounded-lg blur opacity-20 group-hover:opacity-60 transition duration-1000 group-hover:duration-200"}),e.jsxs("div",{className:"relative",children:[e.jsx("div",{className:"absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-cyan-400 transition-colors",children:e.jsx(F,{className:"w-4 h-4"})}),e.jsx("input",{type:"text",value:$,onChange:z,onKeyDown:a=>a.key==="Enter"&&X(),placeholder:"Tìm kiếm thư viện ảnh của bạn...",className:"w-full bg-slate-900/90 backdrop-blur-md rounded-lg py-3 pl-11 pr-24 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-cyan-500/50 border border-white/10 shadow-xl transition-all focus:bg-slate-900"}),e.jsx("button",{onClick:X,className:"absolute right-1.5 top-1/2 -translate-y-1/2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-1.5 rounded-md text-sm font-medium transition-all duration-200 shadow-lg shadow-indigo-500/20 active:scale-95 hover:shadow-cyan-500/20",children:"Search"})]})]}),e.jsx("div",{className:`flex items-center justify-between mt-2 pl-1 transition-all duration-1000 delay-[1400ms] ${o?"opacity-100":"opacity-0"}`,children:e.jsxs("div",{className:"flex items-center gap-2 text-[11px] text-slate-400",children:[e.jsxs("div",{className:"flex gap-1",children:[e.jsx("kbd",{className:"px-1.5 py-0.5 bg-slate-800 rounded border border-slate-700 font-sans text-[10px] text-slate-300",children:"Ctrl"}),e.jsx("kbd",{className:"px-1.5 py-0.5 bg-slate-800 rounded border border-slate-700 font-sans text-[10px] text-slate-300",children:"K"})]}),e.jsx("span",{children:"để tìm kiếm nhanh"})]})})]})]})};export{Q as S};
