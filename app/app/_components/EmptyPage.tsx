import styles from "./EmptyPage.module.css";

type EmptyPageProps = {
  eyebrow: string;
  title: string;
  description: string;
  items?: string[];
};

export function EmptyPage({ eyebrow, title, description, items = [] }: EmptyPageProps) {
  return (
    <section className={styles.panel}>
      <p className={styles.eyebrow}>{eyebrow}</p>
      <h2>{title}</h2>
      <p className={styles.description}>{description}</p>
      {items.length > 0 ? (
        <div className={styles.itemGrid}>
          {items.map((item) => (
            <div className={styles.item} key={item}>
              {item}
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
