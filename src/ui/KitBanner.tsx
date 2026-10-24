import { useMemo, useState } from 'react';
import { isUserSampleId, useUserSamples } from '../audio/userSamples';
import { DEMO_CREDIT, DEMO_KIT } from '../state/demo';
import { useStudio } from '../state/store';
import { IconClose } from './icons';

/**
 * Shown while channels play stand-ins for samples the library lacks: the demo and FL Studio projects arrive
 * without their kit. It says where to get the kit; dropping it anywhere in the studio links it by name.
 */
export function KitBanner() {
  const project = useStudio((s) => s.project);
  const [hiddenFor, setHiddenFor] = useState<string | null>(null);
  const samples = useUserSamples((s) => s.samples);
  const loaded = useUserSamples((s) => s.loaded);
  const missing = useMemo(() => {
    if (!loaded) return [];
    const have = new Set(samples.map((x) => x.id));
    return project.channels.filter((c) => c.sampler?.standIn && isUserSampleId(c.sampler.sampleId) && !have.has(c.sampler.sampleId));
  }, [project.channels, samples, loaded]);
  // Keyed by project name so another project brings the banner back.
  if (!missing.length || hiddenFor === project.name) return null;
  const gassed = missing.every((c) => c.sampler?.sampleName?.startsWith(DEMO_KIT.prefix));
  const n = missing.length;

  return (
    <div className="kit-banner" role="status">
      <div className="kit-banner-text">
        {gassed ? (
          <>
            <strong>Hear it on the real kit.</strong> This beat uses the free{' '}
            <a href={DEMO_KIT.url} target="_blank" rel="noreferrer">
              {DEMO_KIT.name}
            </a>{' '}
            by {DEMO_KIT.by}. Built-in sounds stand in for now: download the kit, then drop its zip anywhere here and{' '}
            {n === 1 ? 'the sound links' : `all ${n} sounds link`} by name.
          </>
        ) : (
          <>
            <strong>
              {n} sample{n === 1 ? '' : 's'} missing.
            </strong>{' '}
            Built-in sounds stand in: drop the kit or the files anywhere here and they link by name.
          </>
        )}
        {gassed && (
          <span className="kit-banner-credit">
            {' '}
            <a href={DEMO_CREDIT.url} target="_blank" rel="noreferrer">
              {DEMO_CREDIT.text}
            </a>
            .
          </span>
        )}
      </div>
      {gassed && (
        <a className="kit-banner-cta" href={DEMO_KIT.url} target="_blank" rel="noreferrer">
          Get the kit
        </a>
      )}
      <button className="icon-btn" aria-label="Hide" data-hint="Hide this message" onClick={() => setHiddenFor(project.name)}>
        <IconClose />
      </button>
    </div>
  );
}
