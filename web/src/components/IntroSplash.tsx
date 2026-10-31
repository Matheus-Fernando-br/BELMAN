import styles from "./IntroSplash.module.css";
import { Wordmark } from "./Logo";
import { NetworkMark } from "./NetworkMark";

// Opening sequence based on the brand video: the network assembles, the
// wordmark comes into focus, then the curtain lifts. Pure CSS, so it ends on
// its own even without JavaScript; shown once per browser session.
export function IntroSplash() {
  return (
    <div className={styles.splash} aria-hidden="true">
      <div className={styles.lockup}>
        <NetworkMark className={styles.mark} interactive={false} />
        <Wordmark className={styles.wordmark} title="" />
      </div>
    </div>
  );
}

// Runs before first paint: skips the intro on repeat visits in the same session.
export const introScript = `(function(){var d=document.documentElement;d.classList.remove('no-js');try{if(sessionStorage.getItem('bellman-intro')||matchMedia('(prefers-reduced-motion: reduce)').matches){d.dataset.intro='seen'}else{sessionStorage.setItem('bellman-intro','1')}}catch(e){}})();`;
