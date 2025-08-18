import React from "react";
export default function Home(){ return <Box title="Home">Home OK</Box>; }
function Box({title,children}){ return (
  <div style={wrap}><div style={card}><h1>{title}</h1><div>{children}</div></div></div>
);} const wrap={minHeight:"100vh",display:"grid",placeItems:"center",
background:"linear-gradient(180deg,#0b0d12,#131620)",color:"#e6e9ef",
fontFamily:"-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Inter,Helvetica,Arial,sans-serif"};
const card={width:"min(800px,92vw)",padding:20,background:"rgba(24,26,34,.8)",
border:"1px solid rgba(255,255,255,.08)",borderRadius:14,backdropFilter:"blur(6px)"};
