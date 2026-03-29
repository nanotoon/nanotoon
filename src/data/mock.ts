// All the mock data from the HTML file, in one place

export const GENRES_ALL = ['Action','Romance','Comedy','Horror','Fantasy','Sci-Fi','Slice of Life','Drama','Mystery','Thriller','Adventure','Supernatural','Historical','Sports','Isekai','BL (Boys Love)','GL (Girls Love)','Short Story','Other']

export const baseComics = [
  { title:"Eclipse Veil", author:"ShadowByte", views:"2.4M", latest:"Ch. 47", genre:"Fantasy", rating:"Mature", format:"Series", slug:"eclipse-veil", desc:"A powerful mage descends into darkness as an ancient veil threatens to tear reality apart. Each chapter darker than the last." },
  { title:"Neon Requiem", author:"VoidPixel", views:"1.8M", latest:"Ch. 32", genre:"Sci-Fi", rating:"General", format:"Series", slug:"neon-requiem", desc:"In the neon-lit ruins of 2148, a rogue android searches for the memory of a song only she can hear." },
  { title:"Cyber Sakura", author:"LunaForge", views:"3.1M", latest:"Ch. 19", genre:"Sci-Fi", rating:"Mature", format:"Series", slug:"cyber-sakura", desc:"Biopunk romance. Two augmented teenagers navigate love and revolution in a city that owns their bodies." },
  { title:"Abyssal Throne", author:"NyxEcho", views:"987K", latest:"Ch. 51", genre:"Fantasy", rating:"Mature", format:"Series", slug:"abyssal-throne", desc:"Beneath the world lies a throne no one wants. A young general is sent to claim it — or be consumed by it." },
  { title:"Quantum Rose", author:"AetherDream", views:"1.2M", latest:"Ch. 28", genre:"Romance", rating:"General", format:"Series", slug:"quantum-rose", desc:"A time-travelling florist keeps meeting the same person at different points in their life, always one moment too early." },
  { title:"Void Walker", author:"DarkPulse", views:"1.9M", latest:"Ch. 12", genre:"Action", rating:"Mature", format:"Series", slug:"void-walker", desc:"She walks between dimensions to hunt the things that hunt everyone else. But something is starting to hunt her back." },
  { title:"Starlit Rebellion", author:"NovaScript", views:"2.7M", latest:"Ch. 33", genre:"Sci-Fi", rating:"General", format:"Series", slug:"starlit-rebellion", desc:"A colonised planet. A stolen ship. Seven strangers who have absolutely no plan and somehow keep winning." },
  { title:"Blood Circuit", author:"IronVeil", views:"1.1M", latest:"Ch. 9", genre:"Action", rating:"Mature", format:"One Shot", slug:"blood-circuit", desc:"One night in the underground fight circuit. One story. No second chances." },
  { title:"Lunar Synthesis", author:"CosmicBit", views:"880K", latest:"Ch. 22", genre:"Sci-Fi", rating:"General", format:"Series", slug:"lunar-synthesis", desc:"Scientists on a lunar base discover that their station is dreaming." },
  { title:"Hollow Petal", author:"MistWeave", views:"1.5M", latest:"Ch. 14", genre:"Romance", rating:"General", format:"One Shot", slug:"hollow-petal", desc:"A ghost falls in love with the person renovating her house." },
  { title:"Iron Celestial", author:"ForgeNode", views:"2.0M", latest:"Ch. 61", genre:"Fantasy", rating:"Mature", format:"Series", slug:"iron-celestial", desc:"Gods made of metal. Wars that last centuries. And one blacksmith who forged the wrong sword." },
  { title:"Pixel Witch", author:"HexFrame", views:"670K", latest:"Ch. 7", genre:"Fantasy", rating:"General", format:"Series", slug:"pixel-witch", desc:"A witch who lives inside video games helps players clear impossible levels — and tries not to fall for any of them." },
  { title:"Echo Paradox", author:"GlitchSage", views:"1.3M", latest:"Ch. 38", genre:"Sci-Fi", rating:"Mature", format:"Series", slug:"echo-paradox", desc:"A detective who can rewind crime scenes by six minutes. Every case leaves her six minutes older than everyone else." },
  { title:"Rust Horizon", author:"AxisDawn", views:"940K", latest:"Ch. 25", genre:"Sci-Fi", rating:"General", format:"Series", slug:"rust-horizon", desc:"Post-collapse road trip. Two mechanics, one working car, and a city that shouldn't still exist on the horizon." },
]

export const GRADIENTS: [string,string][] = [
  ['#4c1d95','#7c3aed'],['#1e3a8a','#3b82f6'],['#831843','#ec4899'],
  ['#78350f','#f59e0b'],['#064e3b','#10b981'],['#0c4a6e','#0ea5e9'],
  ['#7f1d1d','#ef4444'],['#1c1917','#a8a29e'],['#1e1b4b','#6366f1'],
  ['#431407','#f97316'],['#052e16','#22c55e'],['#4a1942','#c026d3'],
  ['#14532d','#16a34a'],['#1e3a5f','#0ea5e9'],
]

export const ACOLORS = ['#7c3aed','#2563eb','#db2777','#d97706','#059669','#0891b2','#dc2626','#c026d3','#0e7490','#047857']

export const categories = [
  { name:"Fantasy", emoji:"🧙", bg:"linear-gradient(135deg,#2e1065,#7c3aed)" },
  { name:"Sci-Fi", emoji:"🚀", bg:"linear-gradient(135deg,#1e3a8a,#3b82f6)" },
  { name:"Romance", emoji:"💕", bg:"linear-gradient(135deg,#831843,#ec4899)" },
  { name:"Action", emoji:"⚔️", bg:"linear-gradient(135deg,#7f1d1d,#ef4444)" },
  { name:"Cyberpunk", emoji:"🌆", bg:"linear-gradient(135deg,#164e63,#06b6d4)" },
  { name:"Horror", emoji:"👁️", bg:"linear-gradient(135deg,#1c1917,#78716c)" },
  { name:"Comedy", emoji:"😂", bg:"linear-gradient(135deg,#78350f,#f59e0b)" },
  { name:"Slice of Life", emoji:"🌸", bg:"linear-gradient(135deg,#052e16,#22c55e)" },
  { name:"Mystery", emoji:"🔍", bg:"linear-gradient(135deg,#1e1b4b,#6366f1)" },
  { name:"Thriller", emoji:"🎭", bg:"linear-gradient(135deg,#431407,#f97316)" },
  { name:"Adventure", emoji:"🗺️", bg:"linear-gradient(135deg,#1c3a1a,#65a30d)" },
  { name:"Supernatural", emoji:"👻", bg:"linear-gradient(135deg,#1a0a2e,#7c3aed)" },
  { name:"Historical", emoji:"📜", bg:"linear-gradient(135deg,#292524,#78716c)" },
  { name:"Sports", emoji:"⚡", bg:"linear-gradient(135deg,#1e3a8a,#0ea5e9)" },
  { name:"Isekai", emoji:"🌀", bg:"linear-gradient(135deg,#1e1b4b,#8b5cf6)" },
  { name:"BL (Boys Love)", emoji:"💙", bg:"linear-gradient(135deg,#1e3a8a,#60a5fa)" },
  { name:"GL (Girls Love)", emoji:"💖", bg:"linear-gradient(135deg,#831843,#f472b6)" },
  { name:"Short Story", emoji:"📖", bg:"linear-gradient(135deg,#14532d,#4ade80)" },
  { name:"Other", emoji:"✨", bg:"linear-gradient(135deg,#1c1917,#a8a29e)" },
]

export const sampleFollowing = [
  { name:"ShadowByte", handle:"@shadowbyte", series:"Eclipse Veil" },
  { name:"VoidPixel", handle:"@voidpixel", series:"Neon Requiem" },
  { name:"LunaForge", handle:"@lunaforge", series:"Cyber Sakura" },
  { name:"NyxEcho", handle:"@nyxecho", series:"Abyssal Throne" },
  { name:"AetherDream", handle:"@aetherdream", series:"Quantum Rose" },
  { name:"DarkPulse", handle:"@darkpulse", series:"Void Walker" },
  { name:"NovaScript", handle:"@novascript", series:"Starlit Rebellion" },
  { name:"IronVeil", handle:"@ironveil", series:"Blood Circuit" },
  { name:"CosmicBit", handle:"@cosmicbit", series:"Lunar Synthesis" },
]

export const sampleFollowers = [
  { name:"ShadowFan", handle:"@shadowfan99" },
  { name:"DarkReader92", handle:"@darkreader92" },
  { name:"LunaVibes", handle:"@lunavibes" },
  { name:"NeonDreamer", handle:"@neondreamer" },
  { name:"VoidChild", handle:"@voidchild" },
  { name:"StarForge", handle:"@starforge_x" },
  { name:"PixelSage", handle:"@pixelsage" },
  { name:"GlitchUser", handle:"@glitchuser" },
]

export const notificationData = [
  { user:"ShadowFan", msg:"replied to your comment on Eclipse Veil Ch. 47", time:"2m ago", read:false },
  { user:"DarkReader92", msg:"commented on your series Eclipse Veil", time:"14m ago", read:false },
  { user:"LunaVibes", msg:"liked your comment on Neon Requiem Ch. 32", time:"1h ago", read:true },
  { user:"NeonDreamer", msg:"started following you", time:"3h ago", read:true },
  { user:"VoidChild", msg:"commented on Eclipse Veil Ch. 47", time:"1d ago", read:true },
]

export function colorFor(s: string) {
  return ACOLORS[s.charCodeAt(0) % ACOLORS.length]
}
