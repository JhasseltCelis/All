import {Composition,Folder} from 'remotion';
import {TennisVideo} from './Video';
import {Opening} from './Opening';import {Experience} from './Experience';import {Stay} from './Stay';import {Checklist} from './Checklist';import {Closing} from './Closing';

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition id="TennixTravel" component={TennisVideo} durationInFrames={1800} fps={30} width={1920} height={1080}/>
      <Folder name="Scenes">
       <Composition id="Opening" component={Opening} durationInFrames={150} fps={30} width={1920} height={1080}/>
       <Composition id="Experience" component={Experience} durationInFrames={450} fps={30} width={1920} height={1080}/>
       <Composition id="Stay" component={Stay} durationInFrames={450} fps={30} width={1920} height={1080}/>
       <Composition id="Checklist" component={Checklist} durationInFrames={450} fps={30} width={1920} height={1080}/>
       <Composition id="Closing" component={Closing} durationInFrames={300} fps={30} width={1920} height={1080}/>
      </Folder>
    </>
  );
};
