'use client';

/**
 * CGL Compliance Dashboard
 *
 * Tracks contractor insurance expirations and WA State L&I updates
 * Route: /app/compliance/page.tsx
 */

import { useEffect, useState, useMemo } from 'react';

interface CompliancePolicy {
  policyNumber: string;
  policyId: string;
  clientNumber: number;
  clientName: string;
  businessName?: string;
  carrier: string;
  effectiveDate: string;
  expirationDate: string;
  daysUntilExpiration: number;
  status: 'active' | 'expiring-soon' | 'critical' | 'expired';
  requiresManualVerification: boolean;
  ubi?: string;
  lniLink?: string;
  email?: string;
  phone?: string;
}

interface UpdatedPoliciesState {
  [policyNumber: string]: {
    updatedAt: string;
    updatedBy?: string;
  };
}

export default function ComplianceDashboard() {
  const [policies, setPolicies] = useState<CompliancePolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [updatedPolicies, setUpdatedPolicies] = useState<UpdatedPoliciesState>({});
  const [lastFetch, setLastFetch] = useState<string | null>(null);

  // Load updated policies from localStorage
  useEffect(() => {
    const stored = localStorage.getItem('compliance_updated_policies');
    if (stored) {
      try {
        setUpdatedPolicies(JSON.parse(stored));
      } catch (e) {
        console.error('Failed to parse stored policies:', e);
      }
    }
  }, []);

  // Fetch policies from API
  const fetchPolicies = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/compliance');

      if (!response.ok) {
        throw new Error(`Failed to fetch policies: ${response.status}`);
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to fetch policies');
      }

      setPolicies(data.policies);
      setLastFetch(data.metadata.fetchedAt);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      console.error('Error fetching policies:', err);
    } finally {
      setLoading(false);
    }
  };

  // Initial fetch
  useEffect(() => {
    fetchPolicies();
  }, []);

  // Toggle policy as updated on state site
  const togglePolicyUpdated = (policyNumber: string) => {
    setUpdatedPolicies(prev => {
      const newState = { ...prev };

      if (newState[policyNumber]) {
        // Remove if already marked
        delete newState[policyNumber];
      } else {
        // Add with timestamp
        newState[policyNumber] = {
          updatedAt: new Date().toISOString(),
          updatedBy: 'user' // Could be enhanced with actual user info
        };
      }

      // Save to localStorage
      localStorage.setItem('compliance_updated_policies', JSON.stringify(newState));

      return newState;
    });
  };

  // Clear all updated policies
  const clearAllUpdated = () => {
    if (confirm('Clear all "Updated on State Site" markers?')) {
      setUpdatedPolicies({});
      localStorage.removeItem('compliance_updated_policies');
    }
  };

  // Filtered policies
  const filteredPolicies = useMemo(() => {
    return policies.filter(policy => {
      // Search filter
      const searchLower = searchTerm.toLowerCase();
      const matchesSearch =
        policy.clientName.toLowerCase().includes(searchLower) ||
        policy.policyNumber.toLowerCase().includes(searchLower) ||
        policy.carrier.toLowerCase().includes(searchLower) ||
        (policy.ubi && policy.ubi.includes(searchTerm));

      // Status filter
      const matchesStatus =
        filterStatus === 'all' ||
        (filterStatus === 'critical' && policy.status === 'critical') ||
        (filterStatus === 'expiring-soon' && policy.status === 'expiring-soon') ||
        (filterStatus === 'expired' && policy.status === 'expired') ||
        (filterStatus === 'manual-verification' && policy.requiresManualVerification) ||
        (filterStatus === 'not-updated' && !updatedPolicies[policy.policyNumber]);

      return matchesSearch && matchesStatus;
    });
  }, [policies, searchTerm, filterStatus, updatedPolicies]);

  // Statistics
  const stats = useMemo(() => {
    return {
      total: policies.length,
      critical: policies.filter(p => p.status === 'critical').length,
      expiringSoon: policies.filter(p => p.status === 'expiring-soon').length,
      expired: policies.filter(p => p.status === 'expired').length,
      manualVerification: policies.filter(p => p.requiresManualVerification).length,
      updated: Object.keys(updatedPolicies).length
    };
  }, [policies, updatedPolicies]);

  // Status color helpers
  const getStatusColor = (status: CompliancePolicy['status']) => {
    switch (status) {
      case 'expired':
        return 'bg-red-100 text-red-800 border-red-300';
      case 'critical':
        return 'bg-red-50 text-red-700 border-red-200';
      case 'expiring-soon':
        return 'bg-yellow-50 text-yellow-800 border-yellow-200';
      case 'active':
        return 'bg-green-50 text-green-700 border-green-200';
      default:
        return 'bg-gray-50 text-gray-700 border-gray-200';
    }
  };

  const getStatusLabel = (daysUntilExpiration: number) => {
    if (daysUntilExpiration < 0) return `Expired ${Math.abs(daysUntilExpiration)} days ago`;
    if (daysUntilExpiration === 0) return 'Expires today';
    if (daysUntilExpiration === 1) return 'Expires tomorrow';
    return `${daysUntilExpiration} days`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading compliance data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-lg">
          <h2 className="text-red-800 font-semibold mb-2">Error Loading Data</h2>
          <p className="text-red-700">{error}</p>
          <button
            onClick={fetchPolicies}
            className="mt-4 bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            CGL Compliance Dashboard
          </h1>
          <p className="text-gray-600">
            Track contractor insurance expirations and WA State L&I updates
          </p>
          {lastFetch && (
            <p className="text-sm text-gray-500 mt-1">
              Last updated: {new Date(lastFetch).toLocaleString()}
            </p>
          )}
        </div>

        {/* Statistics Cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow p-4 border-l-4 border-blue-500">
            <div className="text-2xl font-bold text-gray-900">{stats.total}</div>
            <div className="text-sm text-gray-600">Total Policies</div>
          </div>

          <div className="bg-white rounded-lg shadow p-4 border-l-4 border-red-500">
            <div className="text-2xl font-bold text-red-600">{stats.critical}</div>
            <div className="text-sm text-gray-600">Critical (&lt;30d)</div>
          </div>

          <div className="bg-white rounded-lg shadow p-4 border-l-4 border-yellow-500">
            <div className="text-2xl font-bold text-yellow-600">{stats.expiringSoon}</div>
            <div className="text-sm text-gray-600">Expiring Soon</div>
          </div>

          <div className="bg-white rounded-lg shadow p-4 border-l-4 border-gray-500">
            <div className="text-2xl font-bold text-gray-600">{stats.expired}</div>
            <div className="text-sm text-gray-600">Expired</div>
          </div>

          <div className="bg-white rounded-lg shadow p-4 border-l-4 border-orange-500">
            <div className="text-2xl font-bold text-orange-600">{stats.manualVerification}</div>
            <div className="text-sm text-gray-600">Manual Check</div>
          </div>

          <div className="bg-white rounded-lg shadow p-4 border-l-4 border-green-500">
            <div className="text-2xl font-bold text-green-600">{stats.updated}</div>
            <div className="text-sm text-gray-600">Updated</div>
          </div>
        </div>

        {/* Filters and Search */}
        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <input
                type="text"
                placeholder="Search by client name, policy #, carrier, or UBI..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div className="flex gap-2">
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="all">All Status</option>
                <option value="critical">Critical (&lt;30d)</option>
                <option value="expiring-soon">Expiring Soon (30-60d)</option>
                <option value="expired">Expired</option>
                <option value="manual-verification">Manual Verification</option>
                <option value="not-updated">Not Updated</option>
              </select>

              <button
                onClick={fetchPolicies}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 whitespace-nowrap"
              >
                Refresh Data
              </button>

              <button
                onClick={clearAllUpdated}
                className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 whitespace-nowrap"
              >
                Clear Markers
              </button>
            </div>
          </div>

          <div className="mt-2 text-sm text-gray-600">
            Showing {filteredPolicies.length} of {policies.length} policies
          </div>
        </div>

        {/* Policies Table */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Updated
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Client
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Policy #
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Carrier
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Expiration
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    UBI
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredPolicies.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                      No policies found matching your criteria
                    </td>
                  </tr>
                ) : (
                  filteredPolicies.map((policy) => {
                    const isUpdated = !!updatedPolicies[policy.policyNumber];

                    return (
                      <tr
                        key={policy.policyId}
                        className={`hover:bg-gray-50 ${isUpdated ? 'bg-green-50' : ''}`}
                      >
                        {/* Updated Toggle */}
                        <td className="px-4 py-4 whitespace-nowrap">
                          <button
                            onClick={() => togglePolicyUpdated(policy.policyNumber)}
                            className={`
                              relative inline-flex h-6 w-11 items-center rounded-full transition-colors
                              ${isUpdated ? 'bg-green-600' : 'bg-gray-200'}
                            `}
                            title={
                              isUpdated
                                ? `Updated on ${new Date(updatedPolicies[policy.policyNumber].updatedAt).toLocaleDateString()}`
                                : 'Mark as updated on state site'
                            }
                          >
                            <span
                              className={`
                                inline-block h-4 w-4 transform rounded-full bg-white transition-transform
                                ${isUpdated ? 'translate-x-6' : 'translate-x-1'}
                              `}
                            />
                          </button>
                        </td>

                        {/* Status */}
                        <td className="px-4 py-4 whitespace-nowrap">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getStatusColor(policy.status)}`}>
                            {getStatusLabel(policy.daysUntilExpiration)}
                          </span>
                        </td>

                        {/* Client */}
                        <td className="px-4 py-4">
                          <div className="text-sm font-medium text-gray-900">
                            {policy.clientName}
                          </div>
                          {policy.email && (
                            <div className="text-xs text-gray-500">{policy.email}</div>
                          )}
                        </td>

                        {/* Policy Number */}
                        <td className="px-4 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900 font-mono">
                            {policy.policyNumber}
                          </div>
                        </td>

                        {/* Carrier */}
                        <td className="px-4 py-4">
                          <div className="text-sm text-gray-900">{policy.carrier}</div>
                          {policy.requiresManualVerification && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-800 mt-1">
                              ⚠️ Manual Verification
                            </span>
                          )}
                        </td>

                        {/* Expiration Date */}
                        <td className="px-4 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">
                            {new Date(policy.expirationDate).toLocaleDateString()}
                          </div>
                          <div className="text-xs text-gray-500">
                            Eff: {new Date(policy.effectiveDate).toLocaleDateString()}
                          </div>
                        </td>

                        {/* UBI */}
                        <td className="px-4 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900 font-mono">
                            {policy.ubi || 'N/A'}
                          </div>
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-4 whitespace-nowrap text-sm">
                          {policy.lniLink ? (
                            <a
                              href={policy.lniLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:text-blue-800 font-medium"
                            >
                              WA L&I →
                            </a>
                          ) : (
                            <span className="text-gray-400">No UBI</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Legend */}
        <div className="bg-white rounded-lg shadow p-4 mt-6">
          <h3 className="font-semibold text-gray-900 mb-3">Legend</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
            <div className="flex items-center gap-2">
              <span className="inline-block w-3 h-3 bg-red-500 rounded"></span>
              <span><strong>Red:</strong> &lt;30 days or expired</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-block w-3 h-3 bg-yellow-500 rounded"></span>
              <span><strong>Yellow:</strong> 30-60 days</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-block w-3 h-3 bg-orange-500 rounded"></span>
              <span><strong>⚠️:</strong> Manual verification required (Hiscox, IES, HCC, BTIS)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-block w-3 h-3 bg-green-500 rounded"></span>
              <span><strong>Green bg:</strong> Updated on state site</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
