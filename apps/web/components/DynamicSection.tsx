"use client";

import React from 'react';
import { 
  Pill, 
  AlertTriangle, 
  Beaker, 
  Heart, 
  Activity, 
  Clipboard,
  LucideIcon
} from 'lucide-react';
import { MedicalCard } from '@guardian/ui';

interface DynamicSectionProps {
  title: string;
  icon: string;
  data: any;
  type: 'medications' | 'allergies' | 'labResults' | 'conditions' | 'vitals' | 'procedures';
  sourceDocument?: string | null;
}

const iconMap: Record<string, LucideIcon> = {
  pill: Pill,
  alert: AlertTriangle,
  beaker: Beaker,
  heart: Heart,
  activity: Activity,
  clipboard: Clipboard,
};

export function DynamicSection({ title, icon, data, type, sourceDocument }: DynamicSectionProps) {
  const Icon = iconMap[icon] || Clipboard;

  const renderMedications = (medications: any[]) => {
    return medications.map((med, index) => (
      <MedicalCard key={index} sourceDocument={sourceDocument}>
        <div className="space-y-2">
          <h4 className="font-semibold text-gray-900">{med.name || med.medication || 'Unknown Medication'}</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
            {med.dosage && (
              <div>
                <span className="text-gray-500">Dosage:</span>
                <span className="ml-2 font-medium">{med.dosage}</span>
              </div>
            )}
            {med.frequency && (
              <div>
                <span className="text-gray-500">Frequency:</span>
                <span className="ml-2 font-medium">{med.frequency}</span>
              </div>
            )}
            {med.route && (
              <div>
                <span className="text-gray-500">Route:</span>
                <span className="ml-2 font-medium">{med.route}</span>
              </div>
            )}
            {med.prescriber && (
              <div>
                <span className="text-gray-500">Prescriber:</span>
                <span className="ml-2 font-medium">{med.prescriber}</span>
              </div>
            )}
          </div>
          {med.instructions && (
            <p className="text-sm text-gray-600 italic">{med.instructions}</p>
          )}
        </div>
      </MedicalCard>
    ));
  };

  const renderAllergies = (allergies: any[]) => {
    return allergies.map((allergy, index) => (
      <MedicalCard key={index} sourceDocument={sourceDocument}>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold text-gray-900">{allergy.allergen || allergy.substance || 'Unknown Allergen'}</h4>
            {allergy.severity && (
              <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                allergy.severity.toLowerCase() === 'severe' || allergy.severity.toLowerCase() === 'life-threatening'
                  ? 'bg-red-100 text-red-800'
                  : allergy.severity.toLowerCase() === 'moderate'
                  ? 'bg-yellow-100 text-yellow-800'
                  : 'bg-green-100 text-green-800'
              }`}>
                {allergy.severity}
              </span>
            )}
          </div>
          {allergy.reaction && (
            <div className="text-sm">
              <span className="text-gray-500">Reaction:</span>
              <span className="ml-2">{allergy.reaction}</span>
            </div>
          )}
          {allergy.type && (
            <div className="text-sm">
              <span className="text-gray-500">Type:</span>
              <span className="ml-2">{allergy.type}</span>
            </div>
          )}
        </div>
      </MedicalCard>
    ));
  };

  const renderLabResults = (labResults: any[]) => {
    return (
      <MedicalCard sourceDocument={sourceDocument}>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Test
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Value
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Reference Range
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {labResults.map((result, index) => (
                <tr key={index} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">
                    {result.test_name || result.test || result.name || 'Unknown Test'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900">
                    {result.value} {result.unit && <span className="text-gray-500">{result.unit}</span>}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {result.reference_range || result.reference || 'N/A'}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {result.status && (
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        result.status.toLowerCase().includes('abnormal') || result.status.toLowerCase().includes('high') || result.status.toLowerCase().includes('low')
                          ? 'bg-yellow-100 text-yellow-800'
                          : result.status.toLowerCase().includes('critical')
                          ? 'bg-red-100 text-red-800'
                          : 'bg-green-100 text-green-800'
                      }`}>
                        {result.status}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </MedicalCard>
    );
  };

  const renderConditions = (conditions: any[]) => {
    return conditions.map((condition, index) => (
      <MedicalCard key={index} sourceDocument={sourceDocument}>
        <div className="space-y-2">
          <h4 className="font-semibold text-gray-900">{condition.condition || condition.diagnosis || condition.name || 'Unknown Condition'}</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
            {condition.status && (
              <div>
                <span className="text-gray-500">Status:</span>
                <span className="ml-2 font-medium">{condition.status}</span>
              </div>
            )}
            {condition.date && (
              <div>
                <span className="text-gray-500">Date:</span>
                <span className="ml-2 font-medium">{new Date(condition.date).toLocaleDateString()}</span>
              </div>
            )}
            {condition.severity && (
              <div>
                <span className="text-gray-500">Severity:</span>
                <span className="ml-2 font-medium">{condition.severity}</span>
              </div>
            )}
            {condition.icd_code && (
              <div>
                <span className="text-gray-500">ICD Code:</span>
                <span className="ml-2 font-medium">{condition.icd_code}</span>
              </div>
            )}
          </div>
          {condition.notes && (
            <p className="text-sm text-gray-600 italic">{condition.notes}</p>
          )}
        </div>
      </MedicalCard>
    ));
  };

  const renderVitals = (vitals: any) => {
    const vitalEntries = Object.entries(vitals).filter(([_, value]) => value != null);
    
    return (
      <MedicalCard sourceDocument={sourceDocument}>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {vitalEntries.map(([key, value], index) => (
            <div key={index} className="text-center p-3 bg-gray-50 rounded-lg">
              <div className="text-sm text-gray-500 capitalize mb-1">
                {key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
              </div>
              <div className="text-lg font-semibold text-gray-900">{String(value)}</div>
            </div>
          ))}
        </div>
      </MedicalCard>
    );
  };

  const renderProcedures = (procedures: any[]) => {
    return procedures.map((procedure, index) => (
      <MedicalCard key={index} sourceDocument={sourceDocument}>
        <div className="space-y-2">
          <h4 className="font-semibold text-gray-900">{procedure.procedure || procedure.name || 'Unknown Procedure'}</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
            {procedure.date && (
              <div>
                <span className="text-gray-500">Date:</span>
                <span className="ml-2 font-medium">{new Date(procedure.date).toLocaleDateString()}</span>
              </div>
            )}
            {procedure.provider && (
              <div>
                <span className="text-gray-500">Provider:</span>
                <span className="ml-2 font-medium">{procedure.provider}</span>
              </div>
            )}
            {procedure.outcome && (
              <div>
                <span className="text-gray-500">Outcome:</span>
                <span className="ml-2 font-medium">{procedure.outcome}</span>
              </div>
            )}
          </div>
          {procedure.notes && (
            <p className="text-sm text-gray-600 italic">{procedure.notes}</p>
          )}
        </div>
      </MedicalCard>
    ));
  };

  const renderContent = () => {
    if (!data) return null;

    switch (type) {
      case 'medications':
        return Array.isArray(data) ? renderMedications(data) : renderMedications([data]);
      case 'allergies':
        return Array.isArray(data) ? renderAllergies(data) : renderAllergies([data]);
      case 'labResults':
        return Array.isArray(data) ? renderLabResults(data) : renderLabResults([data]);
      case 'conditions':
        return Array.isArray(data) ? renderConditions(data) : renderConditions([data]);
      case 'vitals':
        return renderVitals(data);
      case 'procedures':
        return Array.isArray(data) ? renderProcedures(data) : renderProcedures([data]);
      default:
        return (
          <MedicalCard sourceDocument={sourceDocument}>
            <pre className="text-sm text-gray-600 whitespace-pre-wrap">
              {JSON.stringify(data, null, 2)}
            </pre>
          </MedicalCard>
        );
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="flex items-center space-x-3 mb-4">
        <div className="flex-shrink-0">
          <Icon className="h-6 w-6 text-blue-600" />
        </div>
        <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
      </div>
      
      <div className="space-y-4">
        {renderContent()}
      </div>
    </div>
  );
}