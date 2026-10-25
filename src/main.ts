import './style.css';
import { Tts } from './speech/tts';
import { mountApp } from './ui/app';

mountApp(document.querySelector<HTMLDivElement>('#app')!, Tts.create());
