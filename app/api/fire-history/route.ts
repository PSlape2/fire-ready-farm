import { NextRequest, NextResponse } from 'next/server';

interface FireHistoryResult {
  success: boolean;
  data: any;
  count: number;
  params: string;
  error?: string;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  
  // Build query parameters for NOAA API
  const params = new URLSearchParams();
  
  try {
    
    // Add any query parameters from the request to the NOAA API call
    searchParams.forEach((value, key) => {
      params.append(key, value);
    });
    
    // Construct the NOAA API URL with parameters
    const noaaApiUrl = `https://www.ncei.noaa.gov/access/paleo-search/study/search.json?${params.toString()}`;
    
    const response = await fetch(noaaApiUrl);
    
    if (!response.ok) {
      throw new Error(`NOAA API responded with status: ${response.status}`);
    }
    
    const data = await response.json();
    
    // Count the number of results
    let resultCount = 0;
    if (data && data.study && Array.isArray(data.study)) {
      resultCount = data.study.length;
    }
    
    const result: FireHistoryResult = {
      success: true,
      data: data,
      count: resultCount,
      params: params.toString()
    };
    
    return NextResponse.json(result);
    
  } catch (error) {
    console.error('Error calling NOAA API:', error);
    const errorResult: FireHistoryResult = {
      success: false,
      data: null,
      count: 0,
      params: params.toString(),
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
    
    return NextResponse.json(errorResult, { status: 500 });
  }
}