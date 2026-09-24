import { Landing } from '@/components/Landing';
import { SmoothScroll } from '@/components/SmoothScroll';

export default function Page() {
  return (
    <>
      {/* Here and nowhere else. It was mounted in the root layout, which put
          a scroll hijack and a requestAnimationFrame loop that never stops on
          every page — including the results, where a reader is lining a clause
          up against its source and momentum fights them. Its own doc comment
          already said landing only; now it is. */}
      <SmoothScroll />
      <Landing />
    </>
  );
}
