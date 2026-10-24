import { useUserSamples } from '../audio/userSamples';
import { relinkPlan } from './flpImport';
import { useStudio } from './store';

/** Relinks whenever the library or the project changes. Not an undo step: it repairs, it doesn't edit. */
export function startRelinking() {
  const run = () => {
    const lib = useUserSamples.getState();
    if (!lib.loaded) return;
    const plan = relinkPlan(useStudio.getState().project, lib.samples);
    if (!plan.size) return;
    useStudio.getState().mutate((d) => {
      for (const ch of d.channels) {
        const id = plan.get(ch.id);
        if (id && ch.sampler) ch.sampler.sampleId = id;
      }
    });
  };
  useUserSamples.subscribe(run);
  useStudio.subscribe((s, prev) => {
    if (s.project !== prev.project) run();
  });
  run();
}
