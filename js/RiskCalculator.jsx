import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { motion, AnimatePresence } from 'motion/react';

/**
 * RiskCalculator - Expert React Island for AidSec
 * Visualizes the cost of a cyber breach vs. prevention.
 */
const RiskCalculator = () => {
  const [dataRecords, setDataRecords] = useState(500);
  const [isHovered, setIsHovered] = useState(false);

  // Constants based on Swiss industry averages (Sophos/BACS 2024 reports)
  const COST_PER_RECORD = 245; // CHF per compromised record
  const FIX_FEE = 490; // Starting AidSec fee

  const totalRisk = dataRecords * COST_PER_RECORD;
  const potentialFine = Math.min(totalRisk * 0.1, 250000); // nDSG caps at 250k for individuals but practices face huge liability
  const totalPotentialDamage = totalRisk + potentialFine;

  const formattedDamage = new Intl.NumberFormat('de-CH', {
    style: 'currency',
    currency: 'CHF',
    maximumFractionDigits: 0
  }).format(totalPotentialDamage);

  const formattedPrevention = new Intl.NumberFormat('de-CH', {
    style: 'currency',
    currency: 'CHF',
    maximumFractionDigits: 0
  }).format(FIX_FEE);

  const roiFactor = Math.round(totalPotentialDamage / FIX_FEE);

  return (
    <motion.div 
      className="risk-calc card card--glass" 
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-100px" }}
      transition={{ duration: 0.6, ease: "easeOut" }}
    >
      <div className="risk-calc__header">
        <h3 className="risk-calc__title">Cyber-Risiko & <span className="text-gold">ROI Rechner</span></h3>
        <p className="risk-calc__intro">Schätzen Sie das finanzielle Risiko Ihrer Kanzlei bei einem Datenverlust.</p>
      </div>

      <div className="risk-calc__body">
        <div className="risk-calc__input-group">
          <div className="risk-calc__label-row">
            <label htmlFor="records-slider">Anzahl Mandanten / Datensätze</label>
            <span className="risk-calc__value-badge">{dataRecords.toLocaleString('de-CH')}</span>
          </div>
          <input
            id="records-slider"
            type="range"
            min="100"
            max="10000"
            step="100"
            value={dataRecords}
            onChange={(e) => setDataRecords(parseInt(e.target.value))}
            className="risk-calc__range"
          />
        </div>

        <div className="risk-calc__results">
          <div className="risk-calc__result-item risk-calc__result-item--danger">
            <span className="risk-calc__result-label">Potenzieller Gesamtschaden (inkl. nDSG Bussen)</span>
            <motion.span 
              key={totalPotentialDamage}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="risk-calc__result-value"
            >
              {formattedDamage}
            </motion.span>
          </div>

          <div className="risk-calc__divider">vs.</div>

          <div className="risk-calc__result-item risk-calc__result-item--safe">
            <span className="risk-calc__result-label">Einmalige AidSec Investition (ab)</span>
            <span className="risk-calc__result-value">{formattedPrevention}</span>
          </div>
        </div>
      </div>

      <div className="risk-calc__footer">
        <div className="risk-calc__roi">
          <div className="risk-calc__roi-circle">
            <span className="risk-calc__roi-multiplier">{roiFactor}x</span>
          </div>
          <div className="risk-calc__roi-text">
            <strong>Effektiver Schutz-Hebel</strong>
            <span>Jeder investierte Franken schützt vor {roiFactor} CHF potenziellem Schaden.</span>
          </div>
        </div>
        
        <a href="#kontakt" className="btn btn--gold btn--full mt-lg">
          Kostenloses Audit vereinbaren
        </a>
      </div>
    </motion.div>
  );
};

// Mount the island
const rootElement = document.getElementById('risk-calculator-root');
if (rootElement) {
    const root = createRoot(rootElement);
    root.render(<RiskCalculator />);
}

export default RiskCalculator;
