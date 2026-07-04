import { useState } from 'react';
import Navbar from './components/Navbar';
import IntroPanel from './components/IntroPanel';
import WizardSteps from './components/WizardSteps';
import StyleSourceScreen from './components/StyleSourceScreen';
import DraftScreen from './components/DraftScreen';
import AuthorViewScreen from './components/AuthorViewScreen';
import ExportScreen from './components/ExportScreen';
import { INITIAL_ELEMENTS } from './data/narrative';
import { useNightMode } from './hooks/useNightMode';

export default function App() {
  const [step, setStep] = useState('style');
  const [elements, setElements] = useState(INITIAL_ELEMENTS);
  const [night, toggleNight] = useNightMode();

  function updateElement(updated) {
    setElements(prev => prev.map(e => (e.id === updated.id ? updated : e)));
  }

  return (
    <>
      <Navbar night={night} onToggleNight={toggleNight} />
      <div className="page">
        <IntroPanel />
        <WizardSteps current={step} />

        {step === 'style' && <StyleSourceScreen onContinue={() => setStep('draft')} />}
        {step === 'draft' && (
          <DraftScreen elements={elements} onChangeElement={updateElement} onContinue={() => setStep('author')} />
        )}
        {step === 'author' && (
          <AuthorViewScreen elements={elements} onBack={() => setStep('draft')} onContinue={() => setStep('export')} />
        )}
        {step === 'export' && <ExportScreen elements={elements} onBack={() => setStep('author')} />}
      </div>
    </>
  );
}
