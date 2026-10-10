import {Frame,Label,Title} from './Design';
import {useCurrentFrame,useVideoConfig,interpolate} from 'remotion';
export const Checklist=()=>{const f=useCurrentFrame();const {fps}=useVideoConfig();return <Frame chapter="03 / CONFIRM THE DETAILS">
 <div style={{paddingTop:90}}><Label>THIRD CHECK</Label><Title>What still needs<br/>confirming?</Title></div>
 <div style={{position:'absolute',right:0,top:150,width:730,padding:42,background:'#E4E8DC',borderRadius:25}}><div style={{fontSize:26,letterSpacing:3,marginBottom:30}}>YOUR CHECKLIST · EXAMPLE</div>
 {['Tickets','Accommodation','Getting around'].map((text,i)=><div key={text} style={{display:'flex',justifyContent:'space-between',alignItems:'center',fontSize:38,padding:'28px 0',borderBottom:'1px solid #BAC5AE',opacity:interpolate(f,[i*.6*fps,(i*.6+.5)*fps],[0,1],{extrapolateLeft:'clamp',extrapolateRight:'clamp'})}}><span>{text}</span><span style={{fontSize:26,borderRadius:40,padding:'13px 22px',background:i===1?'#255345':'#F5F2E9',color:i===1?'white':'#547369'}}>{i===1?'✓ Checked':'○ Pending'}</span></div>)}
 <div style={{fontSize:28,lineHeight:1.5,marginTop:30}}>Keep unconfirmed details<br/>clearly marked.</div></div>
 <div style={{position:'absolute',bottom:65,fontSize:38}}>A short list. A clear next step.</div>
 </Frame>;};
