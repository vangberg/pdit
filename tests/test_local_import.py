import os
import sys
import pytest
from pdit.executor import PythonExecutor

class TestLocalImport:
    def test_local_import(self, tmp_path):
        """Test that importing a local module works."""
        # Create a dummy local module
        local_module = tmp_path / "local_bar.py"
        local_module.write_text("y = 100")
        
        # Change to the temporary directory
        cwd = os.getcwd()
        os.chdir(tmp_path)
        
        try:
            executor = PythonExecutor()
            
            script = "import local_bar\nprint(local_bar.y)"
            
            results = list(executor.execute_script(script))
            
            error_found = None
            output_found = False
            
            for res in results:
                if isinstance(res, list): continue
                for out in res.output:
                    if out.type == "error":
                        error_found = out.content
                    if out.type == "stdout" and "100" in out.content:
                        output_found = True
            
            if error_found:
                pytest.fail(f"Import failed with error: {error_found}")
            
            assert output_found, "Did not find expected output '100'"
            
        finally:
            os.chdir(cwd)