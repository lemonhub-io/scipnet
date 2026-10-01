import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Empty } from '../components/Ui';

export default function NotFound() {
  const { t } = useTranslation();
  return (
    <div className="wrap section">
      <Empty action={<Link to="/" className="btn btn-primary">{t('ui.back')}</Link>}>
        <span className="docnum docnum-hollow" style={{ display: 'inline-block', marginBottom: 14 }}>
          {t('notFound.code')}
        </span>
        <br />
        {t('notFound.text')}
      </Empty>
    </div>
  );
}
