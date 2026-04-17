import { AssessmentImportData } from '../../shared/types/imported.js';

export async function parseAssessmentWorkbook(_buffer: Buffer): Promise<AssessmentImportData> {
  return {
    sheets: ['フェイスシート', 'アセスメント', 'なんでもボックス', '主治医意見書', '認定調査票'],
    faceSheet: { sections: {}, name: '', kana: '', birthDate: '', insuredNumber: '', emergencyContacts: [], family: [] },
    assessment: { sections: {}, items: [] },
    anythingBox: [],
    doctorOpinion: { sections: {} },
    certificationSurvey: { sections: {} },
  };
}
