' Serverni oynasiz (fonda) ishga tushirish: nazoratchi yiqilsa qayta yoqadi; jurnal - data\server.log
Set sh = CreateObject("WScript.Shell")
dir = CreateObject("Scripting.FileSystemObject").GetParentFolderName(CreateObject("Scripting.FileSystemObject").GetParentFolderName(CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)))
sh.CurrentDirectory = dir
sh.Run "cmd /c if not exist data mkdir data & node scripts\run.js >> data\server.log 2>&1", 0, False
