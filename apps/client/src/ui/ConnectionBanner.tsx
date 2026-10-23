import { t } from '../i18n.ts';
import { useSim } from './useSim.ts';

/**
 * Online only: tells the player when the connection dropped (the hero keeps hunting on the
 * server) or when the account was opened on another device.
 */
export function ConnectionBanner() {
  const sim = useSim();
  const status = sim.connection;
  if (status === 'reconnecting') {
    return (
      <div className="net-banner" role="status" data-testid="net-reconnecting">
        {t('net.reconnecting')}
      </div>
    );
  }
  if (status === 'taken') {
    return (
      <div className="net-banner net-banner-stop" role="alert" data-testid="net-taken">
        <p>{t('net.taken')}</p>
        <button type="button" className="btn btn-primary" onClick={() => location.reload()}>
          {t('net.playHere')}
        </button>
      </div>
    );
  }
  return null;
}
