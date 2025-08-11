"use client";

import React from 'react';
import { User, Calendar, CreditCard, Hash } from 'lucide-react';

interface PatientInfo {
  name?: string | null;
  dateOfBirth?: string | null;
  mrn?: string | null;
  insuranceId?: string | null;
}

interface PatientHeaderProps {
  patientInfo: PatientInfo;
}

export function PatientHeader({ patientInfo }: PatientHeaderProps) {
  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    } catch {
      return dateString;
    }
  };

  const hasPatientInfo = patientInfo.name || patientInfo.dateOfBirth || patientInfo.mrn || patientInfo.insuranceId;

  if (!hasPatientInfo) {
    return null;
  }

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
      <h3 className="text-lg font-semibold text-blue-900 mb-3 flex items-center">
        <User className="h-5 w-5 mr-2" />
        Patient Information
      </h3>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {patientInfo.name && (
          <div className="flex items-center space-x-2">
            <User className="h-4 w-4 text-blue-600 flex-shrink-0" />
            <div>
              <label className="text-xs font-medium text-blue-700 uppercase tracking-wide">Name</label>
              <p className="text-sm font-medium text-blue-900">{patientInfo.name}</p>
            </div>
          </div>
        )}

        {patientInfo.dateOfBirth && (
          <div className="flex items-center space-x-2">
            <Calendar className="h-4 w-4 text-blue-600 flex-shrink-0" />
            <div>
              <label className="text-xs font-medium text-blue-700 uppercase tracking-wide">Date of Birth</label>
              <p className="text-sm font-medium text-blue-900">{formatDate(patientInfo.dateOfBirth)}</p>
            </div>
          </div>
        )}

        {patientInfo.mrn && (
          <div className="flex items-center space-x-2">
            <Hash className="h-4 w-4 text-blue-600 flex-shrink-0" />
            <div>
              <label className="text-xs font-medium text-blue-700 uppercase tracking-wide">MRN</label>
              <p className="text-sm font-medium text-blue-900">{patientInfo.mrn}</p>
            </div>
          </div>
        )}

        {patientInfo.insuranceId && (
          <div className="flex items-center space-x-2">
            <CreditCard className="h-4 w-4 text-blue-600 flex-shrink-0" />
            <div>
              <label className="text-xs font-medium text-blue-700 uppercase tracking-wide">Insurance ID</label>
              <p className="text-sm font-medium text-blue-900">{patientInfo.insuranceId}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}