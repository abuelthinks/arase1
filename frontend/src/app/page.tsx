import Link from 'next/link';
import { FileText, Sparkles, LineChart, ShieldCheck, Cpu } from 'lucide-react';
import styles from './page.module.css';

export default function Home() {
  return (
    <div className={styles.heroContainer}>
      <main className={styles.bentoGrid}>
        
        {/* Hero Section Card (Spans large area) */}
        <div className={`${styles.bentoCard} ${styles.heroCard}`}>
          <h1 className={styles.title}>
            Next-Gen <span className={styles.titleHighlight}>Reporting</span><br />
            for SPED Professionals.
          </h1>
          <p className={styles.subtitle}>
            Unify your IEP tracking, generate AI-driven goals, and streamline your entire monthly progress reporting workflow in one platform.
          </p>
          <div className={styles.ctaContainer}>
            <Link href="/login" className={styles.primaryButton}>
              Login to Portal
            </Link>
            <Link href="/schedule" className={styles.secondaryButton}>
              View Schedule
            </Link>
          </div>
        </div>

        {/* AI Highlight Card (Spans vertical or horizontal depending on media query) */}
        <div className={`${styles.bentoCard} ${styles.aiCard}`}>
          <Cpu className={styles.hugeDecorativeIcon} size={200} />
          <div className={`${styles.cardIcon} ${styles.aiIcon}`}>
            <Sparkles size={32} />
          </div>
          <h2 className={styles.cardTitle}>AI-Driven Goals</h2>
          <p className={styles.cardText}>
            Instantly translate your raw observation notes into specific, actionable, and measurable IEP goals tailored to each student's unique needs.
          </p>
        </div>

        {/* Unified Progress Card */}
        <div className={`${styles.bentoCard} ${styles.progressCard}`}>
          <FileText className={styles.hugeDecorativeIcon} size={120} />
          <div className={styles.cardHeader}>
            <div className={`${styles.cardIcon} ${styles.progressIcon}`}>
              <FileText size={24} />
            </div>
            <h3 className={styles.cardTitle}>Unified Inputs</h3>
          </div>
          <p className={styles.cardText}>
            Say goodbye to scattered data. Bring all your student assessments, tracking, and daily notes into one seamless platform.
          </p>
        </div>

        {/* Reporting Card */}
        <div className={`${styles.bentoCard} ${styles.reportCard}`}>
          <LineChart className={styles.hugeDecorativeIcon} size={120} />
          <div className={styles.cardHeader}>
            <div className={`${styles.cardIcon} ${styles.reportIcon}`}>
              <LineChart size={24} />
            </div>
            <h3 className={styles.cardTitle}>Monthly Progress</h3>
          </div>
          <p className={styles.cardText}>
            Automatically compile tracking data into comprehensive monthly progress reports that are easy to share with stakeholders.
          </p>
        </div>

        {/* Security & Compliance Card */}
        <div className={`${styles.bentoCard} ${styles.secureCard}`}>
          <ShieldCheck className={styles.hugeDecorativeIcon} size={120} />
          <div className={styles.cardHeader}>
            <div className={`${styles.cardIcon} ${styles.secureIcon}`}>
              <ShieldCheck size={24} />
            </div>
            <h3 className={styles.cardTitle}>Secure & Compliant</h3>
          </div>
          <p className={styles.cardText}>
            Built from the ground up with data privacy in mind to ensure all student records remain secure and compliant with regulations.
          </p>
        </div>

      </main>
    </div>
  );
}
