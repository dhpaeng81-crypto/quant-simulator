// 작은 통계 도구: 정규분포, 릿지 회귀(가우스 소거)

/** 표준정규 누적분포 (Abramowitz-Stegun 26.2.17, 오차 < 7.5e-8) */
export function normalCdf(z: number): number {
  if (!Number.isFinite(z)) return z > 0 ? 1 : 0;
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804014327 * Math.exp((-z * z) / 2);
  const p = d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return z > 0 ? 1 - p : p;
}

/** A x = b 풀기 (부분 피벗 가우스 소거). A는 정사각 */
export function solve(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-12) throw new Error("singular matrix");
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = c + 1; r < n; r++) {
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r][n];
    for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k];
    x[r] = s / M[r][r];
  }
  return x;
}

export const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);

export function sd(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
}

export function correlation(a: number[], b: number[]): number | null {
  if (a.length !== b.length || a.length < 3) return null;
  const sa = sd(a);
  const sb = sd(b);
  if (sa === 0 || sb === 0) return null;
  const ma = mean(a);
  const mb = mean(b);
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] - ma) * (b[i] - mb);
  return s / (a.length - 1) / (sa * sb);
}

/**
 * 표준화한 입력으로 릿지 회귀. 표준편차가 0인 열은 계수 0.
 * 반환: 표준화 공간 계수, 열 평균·표준편차, y 평균
 */
export function ridge(X: number[][], y: number[], lambda: number) {
  const n = X.length;
  const p = X[0]?.length ?? 0;
  const mu = Array.from({ length: p }, (_, j) => mean(X.map((r) => r[j])));
  const sig = Array.from({ length: p }, (_, j) => sd(X.map((r) => r[j])));
  const ym = mean(y);
  const Z = X.map((r) => r.map((v, j) => (sig[j] > 0 ? (v - mu[j]) / sig[j] : 0)));

  const A = Array.from({ length: p }, () => new Array<number>(p).fill(0));
  const b = new Array<number>(p).fill(0);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < p; j++) {
      b[j] += Z[i][j] * (y[i] - ym);
      for (let k = j; k < p; k++) A[j][k] += Z[i][j] * Z[i][k];
    }
  }
  for (let j = 0; j < p; j++) {
    for (let k = 0; k < j; k++) A[j][k] = A[k][j];
    A[j][j] += lambda;
  }
  const beta = solve(A, b);
  return { beta, mu, sig, ym };
}
