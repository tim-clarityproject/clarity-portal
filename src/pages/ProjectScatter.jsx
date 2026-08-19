import { useLocation, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import BackArrow from '../components/BackArrow';

import HomeHeader from '../components/HomeHeader';

export default function ProjectScatter() {
  const navigate = useNavigate();
  const location = useLocation();
  const [selectedProjectIdx, setSelectedProjectIdx] = useState(null);

  const projects = location.state?.projects || [];
  const matrix = location.state?.matrix || {};
  const progress = location.state?.progress || {};
  const factors = location.state?.factors || [];
  const path = location.state?.path || 'personal';
  const isGuest = location.state?.isGuest || false;

  // Calculate importance totals for each project
  const projectData = projects.map((project, index) => {
    const importance = factors.reduce((sum, _, factorIndex) => {
      const value = matrix[`${index}-${factorIndex}`] || 0;
      return sum + value;
    }, 0);

    const projectProgress = progress[index] || 3;

    return {
      name: project,
      progress: projectProgress,
      importance: importance,
    };
  });

  const maxImportance = Math.max(...projectData.map(d => d.importance), 1);
  const importanceThreshold = maxImportance / 2;
  const progressThreshold = 3;

  // Classify projects into quadrants
  const getQuadrant = (proj) => {
    if (proj.progress >= progressThreshold && proj.importance >= importanceThreshold) return 'leaders';
    if (proj.progress < progressThreshold && proj.importance >= importanceThreshold) return 'visionaries';
    if (proj.progress < progressThreshold && proj.importance < importanceThreshold) return 'niche';
    return 'rising';
  };

  // SVG dimensions and scaling
  const svgWidth = 850;
  const svgHeight = 600;
  const topPadding = 60;
  const bottomPadding = 80;
  const leftPadding = 90;
  const rightPadding = 130;
  const plotWidth = svgWidth - leftPadding - rightPadding;
  const plotHeight = svgHeight - topPadding - bottomPadding;
  const midX = leftPadding + plotWidth / 2;
  const midY = topPadding + plotHeight / 2;

  // Scale functions
  const scaleX = (progressValue) => leftPadding + ((progressValue - 1) / 4) * plotWidth;
  const scaleY = (importanceValue) => svgHeight - bottomPadding - (importanceValue / (maxImportance + 2)) * plotHeight;

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'white', display: 'flex', flexDirection: 'column' }}>
      <HomeHeader isGuest={isGuest} />

      {/* Main Content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: '1200px', margin: '0 auto', width: '100%', padding: '40px 32px' }}>
        <div style={{ marginBottom: '32px', textAlign: 'center' }}>
          <h1 style={{ fontSize: '32px', fontWeight: 'bold', color: 'black', lineHeight: '1.4' }}>
            Project Portfolio Matrix
          </h1>
        </div>

        {/* Gartner Magic Quadrant */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', marginBottom: '48px' }}>
          <svg width={svgWidth} height={svgHeight} style={{ backgroundColor: 'white' }} onClick={() => setSelectedProjectIdx(null)}>
            {/* Click-to-deselect background */}
            <rect x={leftPadding} y={topPadding} width={plotWidth} height={plotHeight} fill="transparent" pointerEvents="none" />

            {/* Quadrant backgrounds */}
            {/* Top-Left: Visionaries (Coral/Reddish) */}
            <rect x={leftPadding} y={topPadding} width={plotWidth / 2} height={plotHeight / 2} fill="#F08571" opacity="0.06" />
            {/* Top-Right: Leaders (Mint) */}
            <rect x={midX} y={topPadding} width={plotWidth / 2} height={plotHeight / 2} fill="#5ECCC0" opacity="0.1" />
            {/* Bottom-Left: Niche (Light Gray) */}
            <rect x={leftPadding} y={midY} width={plotWidth / 2} height={plotHeight / 2} fill="#D1D5DB" opacity="0.04" />
            {/* Bottom-Right: Rising Stars (Coral Light) */}
            <rect x={midX} y={midY} width={plotWidth / 2} height={plotHeight / 2} fill="#F08571" opacity="0.03" />

            {/* Axis lines */}
            <line x1={leftPadding} y1={midY} x2={svgWidth - rightPadding} y2={midY} stroke="#333" strokeWidth="2" />
            <line x1={midX} y1={topPadding} x2={midX} y2={svgHeight - bottomPadding} stroke="#333" strokeWidth="2" />

            {/* X-axis scale and ticks */}
            {[1, 2, 3, 4, 5].map((tick) => (
              <g key={`x-tick-${tick}`}>
                <line x1={scaleX(tick)} y1={midY} x2={scaleX(tick)} y2={midY + 6} stroke="#333" strokeWidth="1" />
                <text x={scaleX(tick)} y={midY + 22} textAnchor="middle" fontSize="12" fill="#333">
                  {tick}
                </text>
              </g>
            ))}

            {/* Y-axis scale and ticks - centered on vertical line */}
            {Array.from({ length: Math.ceil(maxImportance + 2) + 1 }, (_, i) => i).map((tick, idx) => (
              <g key={`y-tick-${idx}`}>
                <line x1={midX - 4} y1={scaleY(tick)} x2={midX + 4} y2={scaleY(tick)} stroke="#333" strokeWidth="1" />
                <text x={midX - 15} y={scaleY(tick) + 4} textAnchor="end" fontSize="12" fill="#333">
                  {tick}
                </text>
              </g>
            ))}

            {/* Axis titles */}
            <text x={svgWidth - rightPadding + 15} y={midY - 8} fontSize="12" fill="#333" fontWeight="bold">
              Project Progress
            </text>
            <text x={midX} y={topPadding - 15} textAnchor="middle" fontSize="12" fill="#333" fontWeight="bold">
              Project Importance
            </text>

            {/* Data points with labels */}
            {projectData.map((project, idx) => {
              const x = scaleX(project.progress);
              const y = scaleY(project.importance);
              const labelX = x + 12;
              const labelY = y - 10;
              const isSelected = selectedProjectIdx === idx;
              return (
                <g key={idx} style={{ cursor: 'pointer' }} onClick={(e) => {
                  e.stopPropagation();
                  setSelectedProjectIdx(isSelected ? null : idx);
                }}>
                  <circle
                    cx={x}
                    cy={y}
                    r={isSelected ? 10 : 7}
                    fill="#F08571"
                    opacity={isSelected ? 1 : 0.8}
                    style={{ transition: 'all 0.2s ease' }}
                  />
                  <circle
                    cx={x}
                    cy={y}
                    r={isSelected ? 10 : 7}
                    fill="none"
                    stroke="#F08571"
                    strokeWidth={isSelected ? 3 : 2}
                    opacity={isSelected ? 0.8 : 0.4}
                    style={{ transition: 'all 0.2s ease' }}
                  />
                  {/* Project name label */}
                  <text
                    x={labelX}
                    y={labelY}
                    fontSize={isSelected ? '12' : '11'}
                    fill={isSelected ? '#F08571' : '#333'}
                    fontWeight={isSelected ? '700' : '500'}
                    pointerEvents="none"
                    style={{ transition: 'all 0.2s ease' }}
                  >
                    {project.name}
                  </text>
                </g>
              );
            })}
          </svg>

          {/* Project breakdown */}
          <div style={{ marginTop: '48px', width: '100%', maxWidth: '850px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '16px' }}>
              {projectData.map((project, idx) => {
                const isSelected = selectedProjectIdx === idx;
                return (
                  <div
                    key={idx}
                    onClick={() => setSelectedProjectIdx(isSelected ? null : idx)}
                    style={{
                      padding: '16px',
                      backgroundColor: isSelected ? '#FEE5DE' : '#f9f9f9',
                      borderRadius: '8px',
                      borderLeft: '4px solid #F08571',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      boxShadow: isSelected ? '0 4px 12px rgba(240, 133, 113, 0.15)' : 'none',
                      transform: isSelected ? 'scale(1.02)' : 'scale(1)',
                    }}
                  >
                    <div style={{ fontWeight: '600', fontSize: '14px', color: isSelected ? '#F08571' : '#333', marginBottom: '12px' }}>
                      {project.name}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', fontSize: '13px' }}>
                      <div>
                        <div style={{ color: '#666', marginBottom: '4px', fontSize: '12px' }}>Progress</div>
                        <div style={{ fontWeight: '600', color: '#F08571', fontSize: '18px' }}>
                          {project.progress}/5
                        </div>
                      </div>
                      <div>
                        <div style={{ color: '#666', marginBottom: '4px', fontSize: '12px' }}>Importance</div>
                        <div style={{ fontWeight: '600', color: '#5ECCC0', fontSize: '18px' }}>
                          {project.importance}
                        </div>
                      </div>
                    </div>
                    {/* Visual progress bar */}
                    <div style={{ marginTop: '12px', height: '4px', backgroundColor: '#e5e5e5', borderRadius: '2px', overflow: 'hidden' }}>
                      <div
                        style={{
                          height: '100%',
                          backgroundColor: '#F08571',
                          width: `${(project.progress / 5) * 100}%`,
                          transition: 'width 0.3s ease',
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', alignItems: 'center', marginBottom: '24px' }}>
          <button
            type="button"
            onClick={() => navigate('/project-progress', { state: { ...location.state, isGuest } })}
            style={{
              backgroundColor: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: '8px',
              color: '#666',
              transition: 'color 0.2s',
              display: 'flex',
              alignItems: 'center',
            }}
            onMouseEnter={(e) => e.target.style.color = '#000'}
            onMouseLeave={(e) => e.target.style.color = '#666'}
          >
            <BackArrow />
          </button>

          {path === 'team' ? (
            <>
              <button
                onClick={() => {
                  // Save functionality - could print to PDF or download
                  window.print();
                }}
                style={{
                  padding: '16px 32px',
                  backgroundColor: 'transparent',
                  color: '#F08571',
                  fontWeight: 'bold',
                  border: '2px solid #F08571',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.target.style.backgroundColor = '#FEE5DE';
                }}
                onMouseLeave={(e) => {
                  e.target.style.backgroundColor = 'transparent';
                }}
              >
                Save
              </button>
              <button
                onClick={() => {
                  // Share functionality
                  if (navigator.share) {
                    navigator.share({
                      title: 'Project Portfolio Matrix',
                      text: 'Check out my project portfolio analysis',
                    });
                  } else {
                    // Fallback: copy current URL to clipboard
                    navigator.clipboard.writeText(window.location.href);
                    alert('Link copied to clipboard!');
                  }
                }}
                style={{
                  padding: '16px 32px',
                  backgroundColor: '#5ECCC0',
                  color: 'white',
                  fontWeight: 'bold',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => e.target.style.backgroundColor = '#4CB8A8'}
                onMouseLeave={(e) => e.target.style.backgroundColor = '#5ECCC0'}
              >
                Share
              </button>
            </>
          ) : (
            <button
              onClick={() => navigate('/results', { state: { ...location.state, isGuest } })}
              style={{
                padding: '16px 32px',
                backgroundColor: '#F08571',
                color: 'white',
                fontWeight: 'bold',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => e.target.style.backgroundColor = '#e07560'}
              onMouseLeave={(e) => e.target.style.backgroundColor = '#F08571'}
            >
              Continue
            </button>
          )}
        </div>

      </div>

    </div>
  );
}
