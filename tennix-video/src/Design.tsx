import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig, Easing} from 'remotion';

export const Frame: React.FC<{children: React.ReactNode; chapter: string; dark?: boolean}> = ({children, chapter, dark=false}) => {
 const frame=useCurrentFrame(); const {fps}=useVideoConfig();
 return <AbsoluteFill style={{background: dark?'#102C27':'#F5F2E9',color:dark?'#F5F2E9':'#102C27',fontFamily:'Arial, sans-serif',padding:90,overflow:'hidden'}}>
  <div style={{position:'absolute',right:-270,top:180,width:800,height:800,borderRadius:'50%',border:'2px solid',borderColor:dark?'#31544A':'#D8DDD1',opacity:.5}}/>
  <div style={{display:'flex',justifyContent:'space-between',fontSize:26,letterSpacing:4,fontWeight:700}}><span>TENNIX / TRAVEL</span><span>{chapter}</span></div>
  <div style={{flex:1,position:'relative',opacity:interpolate(frame,[0,.7*fps],[0,1],{extrapolateRight:'clamp',extrapolateLeft:'clamp'}),translate:interpolate(frame,[0,.9*fps],['0px 35px','0px 0px'],{extrapolateRight:'clamp',extrapolateLeft:'clamp',easing:Easing.bezier(.16,1,.3,1)})}}>{children}</div>
  <div style={{display:'flex',justifyContent:'space-between',fontSize:24,color:dark?'#BBD0C1':'#547369'}}><span>YOUR NEXT TENNIS TRIP</span><span>START WITH A CHECKLIST</span></div>
 </AbsoluteFill>;
};
export const Label: React.FC<{children:React.ReactNode}>=({children})=><div style={{fontSize:28,letterSpacing:4,fontWeight:700,color:'#739448',marginBottom:28}}>{children}</div>;
export const Title: React.FC<{children:React.ReactNode}>=({children})=><h1 style={{fontSize:94,lineHeight:1.05,letterSpacing:-5,margin:'0 0 34px',fontWeight:700}}>{children}</h1>;
export const Ball=()=> <svg viewBox="0 0 100 100" width="130" height="130"><circle cx="50" cy="50" r="48" fill="#D5EC78"/><path d="M20 10C72 42 72 58 20 90M80 10C28 42 28 58 80 90" fill="none" stroke="#FAFFE7" strokeWidth="4"/></svg>;
