'use client';

interface AddProfilePlaceholderProps {
  onClose: () => void;
}

export function AddProfilePlaceholder({ onClose }: AddProfilePlaceholderProps) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
        <h2 className="text-lg font-semibold mb-4">Add New Profile</h2>
        
        <div className="space-y-4 mb-6">
          <p className="text-gray-600 text-sm">
            Add Profile functionality will be implemented in Phase 2: Component Library.
          </p>
          
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <h3 className="font-medium text-blue-900 text-sm mb-1">Coming in Phase 2:</h3>
            <ul className="text-blue-700 text-xs space-y-1">
              <li>• Profile creation form with validation</li>
              <li>• Avatar upload functionality</li>
              <li>• Profile type selection (child, pet, dependent)</li>
              <li>• Relationship management</li>
              <li>• Permission configuration</li>
            </ul>
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
          >
            Got it
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors"
          >
            Continue Building
          </button>
        </div>
      </div>
    </div>
  );
}