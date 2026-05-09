import { NextRequest, NextResponse } from 'next/server';

interface FireHistoryResult {
  success: boolean;
  data: any; // raw NOAA paleo-search response — shape varies by query
  count: number;
  params: string;
  error?: string;
}

/**
 * GET /api/fire-history
 * Proxies the NOAA Paleoclimatology study-search API to fetch fire-scar records
 * near a given coordinate bounding box. Pass `dataTypeId=12` to filter for
 * fire-history studies specifically (the default used by the assess flow).
 * All query params are forwarded verbatim to the NOAA endpoint.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const params = new URLSearchParams();

  try {
    searchParams.forEach((value, key) => {
      params.append(key, value);
    });

    const noaaApiUrl = `https://www.ncei.noaa.gov/access/paleo-search/study/search.json?${params.toString()}`;
    
    const response = await fetch(noaaApiUrl);

    if (!response.ok) {
      throw new Error(`NOAA API responded with status: ${response.status}`);
    }

    const data = await response.json();

    const resultCount = data?.study && Array.isArray(data.study) ? data.study.length : 0;

    const result: FireHistoryResult = {
      success: true,
      data,
      count: resultCount,
      params: params.toString(),
    };

    return NextResponse.json(result);

  } catch (error) {
    console.error('Error calling NOAA API:', error);
    const errorResult: FireHistoryResult = {
      success: false,
      data: null,
      count: 0,
      params: params.toString(),
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };

    return NextResponse.json(errorResult, { status: 500 });
  }
}