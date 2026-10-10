import {Series,useVideoConfig,staticFile} from 'remotion';
import {Audio} from '@remotion/media';
import {Opening} from './Opening';import {Experience} from './Experience';import {Stay} from './Stay';import {Checklist} from './Checklist';import {Closing} from './Closing';
export const TennisVideo=()=>{const {fps}=useVideoConfig();return <>
 <Series>
 <Series.Sequence name="Three checks before you book" durationInFrames={5*fps} premountFor={fps}><Opening/></Series.Sequence>
 <Series.Sequence name="The tennis experience" durationInFrames={15*fps} premountFor={fps}><Experience/></Series.Sequence>
 <Series.Sequence name="Stay and logistics" durationInFrames={15*fps} premountFor={fps}><Stay/></Series.Sequence>
 <Series.Sequence name="Checked or pending" durationInFrames={15*fps} premountFor={fps}><Checklist/></Series.Sequence>
 <Series.Sequence name="Explore Tennix Travel" durationInFrames={10*fps} premountFor={fps}><Closing/></Series.Sequence>
 </Series>
 <Audio name="English guide narration" src={staticFile('voiceover.wav')} premountFor={fps}/>
 </>;};
