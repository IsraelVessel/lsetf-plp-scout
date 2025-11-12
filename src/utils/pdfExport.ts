import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

interface CandidateData {
  candidates: {
    name: string;
    email: string;
    phone?: string;
  };
  job_role?: string;
  status: string;
  ai_analysis?: Array<{
    overall_score?: number;
    skills_score?: number;
    experience_score?: number;
    education_score?: number;
    recommendations?: string;
    analysis_summary?: any;
  }>;
  skills?: Array<{
    skill_name: string;
    proficiency_level?: string;
  }>;
}

export const exportCandidateToPDF = async (application: CandidateData) => {
  const pdf = new jsPDF('p', 'mm', 'a4');
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 20;
  let yPosition = margin;

  const candidate = application.candidates;
  const analysis = application.ai_analysis?.[0];

  // Header
  pdf.setFillColor(79, 70, 229); // primary color
  pdf.rect(0, 0, pageWidth, 40, 'F');
  
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(24);
  pdf.text('Candidate Report', margin, 25);

  yPosition = 50;

  // Candidate Info
  pdf.setTextColor(0, 0, 0);
  pdf.setFontSize(18);
  pdf.text('Candidate Information', margin, yPosition);
  yPosition += 10;

  pdf.setFontSize(12);
  pdf.text(`Name: ${candidate.name}`, margin, yPosition);
  yPosition += 7;
  pdf.text(`Email: ${candidate.email}`, margin, yPosition);
  yPosition += 7;
  if (candidate.phone) {
    pdf.text(`Phone: ${candidate.phone}`, margin, yPosition);
    yPosition += 7;
  }
  if (application.job_role) {
    pdf.text(`Job Role: ${application.job_role}`, margin, yPosition);
    yPosition += 7;
  }
  pdf.text(`Status: ${application.status.charAt(0).toUpperCase() + application.status.slice(1)}`, margin, yPosition);
  yPosition += 15;

  // Analysis Scores
  if (analysis) {
    pdf.setFontSize(18);
    pdf.text('Analysis Scores', margin, yPosition);
    yPosition += 10;

    // Score bars
    const drawScoreBar = (label: string, score: number, y: number) => {
      pdf.setFontSize(11);
      pdf.text(label, margin, y);
      
      const barWidth = pageWidth - (2 * margin) - 30;
      const barHeight = 8;
      const filledWidth = (score / 100) * barWidth;
      
      // Background
      pdf.setFillColor(230, 230, 230);
      pdf.rect(margin + 30, y - 5, barWidth, barHeight, 'F');
      
      // Filled portion
      let color;
      if (score >= 80) color = [34, 197, 94]; // green
      else if (score >= 60) color = [59, 130, 246]; // blue
      else if (score >= 40) color = [234, 179, 8]; // yellow
      else color = [239, 68, 68]; // red
      
      pdf.setFillColor(color[0], color[1], color[2]);
      pdf.rect(margin + 30, y - 5, filledWidth, barHeight, 'F');
      
      // Score text
      pdf.setTextColor(0, 0, 0);
      pdf.text(`${score}`, margin + 30 + barWidth + 5, y);
    };

    if (analysis.overall_score !== undefined) {
      drawScoreBar('Overall:', analysis.overall_score, yPosition);
      yPosition += 15;
    }
    if (analysis.skills_score !== undefined) {
      drawScoreBar('Skills:', analysis.skills_score, yPosition);
      yPosition += 15;
    }
    if (analysis.experience_score !== undefined) {
      drawScoreBar('Experience:', analysis.experience_score, yPosition);
      yPosition += 15;
    }
    if (analysis.education_score !== undefined) {
      drawScoreBar('Education:', analysis.education_score, yPosition);
      yPosition += 15;
    }
  }

  // Skills
  if (application.skills && application.skills.length > 0) {
    if (yPosition > pageHeight - 60) {
      pdf.addPage();
      yPosition = margin;
    }

    pdf.setFontSize(18);
    pdf.text('Skills', margin, yPosition);
    yPosition += 10;

    pdf.setFontSize(11);
    application.skills.forEach((skill) => {
      const skillText = `• ${skill.skill_name}${skill.proficiency_level ? ` (${skill.proficiency_level})` : ''}`;
      pdf.text(skillText, margin + 5, yPosition);
      yPosition += 7;

      if (yPosition > pageHeight - margin) {
        pdf.addPage();
        yPosition = margin;
      }
    });
    yPosition += 5;
  }

  // Recommendations
  if (analysis?.recommendations) {
    if (yPosition > pageHeight - 80) {
      pdf.addPage();
      yPosition = margin;
    }

    pdf.setFontSize(18);
    pdf.text('Recommendations', margin, yPosition);
    yPosition += 10;

    pdf.setFontSize(11);
    const lines = pdf.splitTextToSize(analysis.recommendations, pageWidth - (2 * margin));
    lines.forEach((line: string) => {
      if (yPosition > pageHeight - margin) {
        pdf.addPage();
        yPosition = margin;
      }
      pdf.text(line, margin, yPosition);
      yPosition += 7;
    });
  }

  // Footer
  const pageCount = pdf.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    pdf.setPage(i);
    pdf.setFontSize(9);
    pdf.setTextColor(128, 128, 128);
    pdf.text(
      `Generated on ${new Date().toLocaleDateString()} - Page ${i} of ${pageCount}`,
      pageWidth / 2,
      pageHeight - 10,
      { align: 'center' }
    );
  }

  // Save
  const fileName = `${candidate.name.replace(/\s+/g, '_')}_Report.pdf`;
  pdf.save(fileName);
};

export const exportMultipleCandidatesToPDF = async (applications: CandidateData[]) => {
  const pdf = new jsPDF('p', 'mm', 'a4');
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 20;
  
  // Cover page
  pdf.setFillColor(79, 70, 229);
  pdf.rect(0, 0, pageWidth, pageHeight, 'F');
  
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(32);
  pdf.text('Candidate Summary Report', pageWidth / 2, pageHeight / 2 - 20, { align: 'center' });
  
  pdf.setFontSize(16);
  pdf.text(`${applications.length} Candidates`, pageWidth / 2, pageHeight / 2 + 10, { align: 'center' });
  pdf.text(new Date().toLocaleDateString(), pageWidth / 2, pageHeight / 2 + 25, { align: 'center' });

  // Add each candidate
  applications.forEach((app, index) => {
    pdf.addPage();
    let yPosition = margin;

    const candidate = app.candidates;
    const analysis = app.ai_analysis?.[0];

    // Header
    pdf.setFillColor(79, 70, 229);
    pdf.rect(0, 0, pageWidth, 30, 'F');
    
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(20);
    pdf.text(`${index + 1}. ${candidate.name}`, margin, 20);

    yPosition = 40;

    // Candidate Info
    pdf.setTextColor(0, 0, 0);
    pdf.setFontSize(12);
    pdf.text(`Email: ${candidate.email}`, margin, yPosition);
    yPosition += 7;
    if (candidate.phone) {
      pdf.text(`Phone: ${candidate.phone}`, margin, yPosition);
      yPosition += 7;
    }
    if (app.job_role) {
      pdf.text(`Job Role: ${app.job_role}`, margin, yPosition);
      yPosition += 7;
    }
    yPosition += 5;

    // Scores
    if (analysis) {
      pdf.setFontSize(14);
      pdf.text('Scores', margin, yPosition);
      yPosition += 8;

      pdf.setFontSize(11);
      if (analysis.overall_score !== undefined) {
        pdf.text(`Overall: ${analysis.overall_score}/100`, margin + 5, yPosition);
        yPosition += 7;
      }
      if (analysis.skills_score !== undefined) {
        pdf.text(`Skills: ${analysis.skills_score}/100`, margin + 5, yPosition);
        yPosition += 7;
      }
      if (analysis.experience_score !== undefined) {
        pdf.text(`Experience: ${analysis.experience_score}/100`, margin + 5, yPosition);
        yPosition += 7;
      }
      if (analysis.education_score !== undefined) {
        pdf.text(`Education: ${analysis.education_score}/100`, margin + 5, yPosition);
        yPosition += 7;
      }
    }
  });

  // Save
  const fileName = `Candidates_Summary_${new Date().toISOString().split('T')[0]}.pdf`;
  pdf.save(fileName);
};