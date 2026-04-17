import { CareplanImportData } from '../../shared/types/imported.js';

export async function parseCareplanWorkbook(_buffer: Buffer): Promise<CareplanImportData> {
  return {
    sheets: ['第1表', '第2表', '第3表', '第4表', '第5表', 'モニタリング'],
    table1: {
      createdDate: '', planType: '', certificationStatus: '', userName: '', birthDate: {}, address: '', insuredNumber: '', insurerNumber: '', creatorName: '', office: '',
      planChangedDate: '', firstPlanDate: '', recognitionDate: '', recognitionPeriod: '', careLevel: '', assessmentResult: '', committeeOpinion: '', totalPolicy: '', livingSupportReason: '',
    },
    table2: [],
    table3: { timeSlots: [], dailyActivities: '', weeklyExtraServices: '' },
    table4: {},
    table5: [],
    monitoring: { history: [], sessions: [] },
  };
}
