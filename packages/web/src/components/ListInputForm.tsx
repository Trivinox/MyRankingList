import { useTranslation } from 'react-i18next';
import { findDuplicates } from '../core/duplicates.ts';
import { isAllowedImageUrl } from '../core/images.ts';
import { useListDraft } from '../state/listDraftStore.ts';
import styles from './ListInputForm.module.css';

// Adjustable: past this many rows the warning shows up, without blocking.
export const LONG_LIST_THRESHOLD = 30;

const MIN_ITEMS = 3;
const TEXT_LIMIT = 80;
const CRITERION_LIMIT = 100;

export function ListInputForm() {
  const { t } = useTranslation();
  const {
    items,
    criterion,
    addItem,
    removeItem,
    updateItemText,
    updateItemImageUrl,
    setCriterion,
  } = useListDraft();

  const duplicateRows = new Set(
    findDuplicates(items.map((item) => item.text)).flatMap((group) => group.indexes),
  );

  // An empty row is a field waiting to be filled, not an item, so the counter,
  // the long-list warning and the gate below all work off this one number.
  const itemCount = items.filter((item) => item.text.trim() !== '').length;
  const ready = itemCount >= MIN_ITEMS && criterion.trim() !== '';

  return (
    <form className={styles.form} onSubmit={(event) => event.preventDefault()}>
      <label className={styles.criterion}>
        <span className={styles.label}>{t('form.criterionLabel')}</span>
        <input
          type="text"
          value={criterion}
          maxLength={CRITERION_LIMIT}
          placeholder={t('form.criterionPlaceholder')}
          onChange={(event) => setCriterion(event.target.value)}
        />
      </label>

      <div className={styles.itemsHeader}>
        <h2 className={styles.heading}>{t('form.itemsHeading')}</h2>
        <span className={styles.count}>{t('form.itemCount', { count: itemCount })}</span>
        {itemCount >= LONG_LIST_THRESHOLD && (
          <span
            role="img"
            aria-label={t('form.longListWarning')}
            title={t('form.longListWarning')}
            className={styles.warning}
          >
            !
          </span>
        )}
      </div>

      <ol className={styles.items}>
        {items.map((item, index) => {
          const number = index + 1;
          const imageUrl = item.imageUrl ?? '';
          const badImage = imageUrl !== '' && !isAllowedImageUrl(imageUrl);
          const duplicated = duplicateRows.has(index);
          const duplicateNoticeId = `duplicate-notice-${item.id}`;
          const imageNoticeId = `image-notice-${item.id}`;

          return (
            <li key={item.id} className={styles.row}>
              <input
                type="text"
                className={styles.text}
                value={item.text}
                maxLength={TEXT_LIMIT}
                aria-label={t('form.itemLabel', { number })}
                aria-describedby={duplicated ? duplicateNoticeId : undefined}
                placeholder={t('form.itemPlaceholder')}
                onChange={(event) => updateItemText(item.id, event.target.value)}
              />
              <input
                type="url"
                className={styles.image}
                value={imageUrl}
                aria-label={t('form.imageUrlLabel', { number })}
                aria-describedby={badImage ? imageNoticeId : undefined}
                placeholder={t('form.imageUrlPlaceholder')}
                onChange={(event) => updateItemImageUrl(item.id, event.target.value)}
              />
              <button
                type="button"
                className={styles.remove}
                aria-label={t('form.removeItem', { number })}
                onClick={() => removeItem(item.id)}
              >
                &times;
              </button>
              {duplicated && (
                <span id={duplicateNoticeId} className={styles.flag}>
                  {t('form.duplicateFlag')}
                </span>
              )}
              {badImage && (
                <span id={imageNoticeId} className={styles.flag}>
                  {t('form.imageUrlRejected')}
                </span>
              )}
            </li>
          );
        })}
      </ol>

      <button type="button" className={styles.add} onClick={addItem}>
        {t('form.addItem')}
      </button>

      {duplicateRows.size > 0 && <p className={styles.notice}>{t('form.duplicateNotice')}</p>}

      <div className={styles.footer}>
        <button type="submit" className={styles.continue} disabled={!ready}>
          {t('form.continue')}
        </button>
        {!ready && (
          <p className={styles.notice}>
            {itemCount < MIN_ITEMS
              ? t('form.minimumNotice', { count: MIN_ITEMS })
              : t('form.criterionNotice')}
          </p>
        )}
      </div>
    </form>
  );
}
